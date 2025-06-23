import express from 'express';
import { supabase, supabaseAuthMiddleware } from '../supabaseClient.js';
import { WowzaStreamingService } from '../services/WowzaStreamingService.js';

const router = express.Router();

// Iniciar transmissão
router.post('/start', supabaseAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { playlistId, serverId } = req.body;

        if (!playlistId) {
            return res.status(400).json({ error: 'ID da playlist é obrigatório' });
        }

        // Verificar se já existe uma transmissão ativa para o usuário
        const { data: activeStream } = await supabase
            .from('streams')
            .select('*')
            .eq('user_id', userId)
            .eq('is_live', true)
            .single();

        if (activeStream) {
            return res.status(400).json({ 
                error: 'Já existe uma transmissão ativa para este usuário',
                streamId: activeStream.id
            });
        }

        // Verificar se a playlist existe e pertence ao usuário
        const { data: playlist, error: playlistError } = await supabase
            .from('playlists')
            .select('*')
            .eq('id', playlistId)
            .eq('id_user', userId)
            .single();

        if (playlistError || !playlist) {
            return res.status(404).json({ error: 'Playlist não encontrada ou não pertence ao usuário' });
        }

        // Buscar vídeos da playlist
        const { data: playlistVideos, error: videosError } = await supabase
            .from('playlist_videos')
            .select(`
                id,
                ordem,
                videos (
                    id,
                    nome,
                    url,
                    duracao,
                    filename
                )
            `)
            .eq('id_playlist', playlistId)
            .order('ordem', { ascending: true });

        if (videosError || !playlistVideos || playlistVideos.length === 0) {
            return res.status(400).json({ error: 'Playlist vazia ou erro ao carregar vídeos' });
        }

        // Buscar servidor (se especificado) ou usar o padrão
        let server = null;
        if (serverId) {
            const { data: serverData } = await supabase
                .from('servers')
                .select('*')
                .eq('id', serverId)
                .single();
            server = serverData;
        }

        // Criar registro de stream no banco
        const { data: newStream, error: streamError } = await supabase
            .from('streams')
            .insert({
                user_id: userId,
                server_id: serverId || null,
                is_live: false,
                viewers: 0,
                bitrate: 0,
                uptime: '00:00:00'
            })
            .select()
            .single();

        if (streamError) {
            throw new Error('Erro ao criar registro de stream: ' + streamError.message);
        }

        // Inicializar serviço Wowza
        const wowzaService = new WowzaStreamingService();
        
        // Preparar lista de vídeos para transmissão
        const videoList = playlistVideos.map(pv => ({
            id: pv.videos.id,
            nome: pv.videos.nome,
            url: pv.videos.url,
            duracao: pv.videos.duracao,
            filename: pv.videos.filename,
            ordem: pv.ordem
        }));

        // Iniciar transmissão no Wowza
        const streamResult = await wowzaService.startStream({
            streamId: newStream.id,
            userId: userId,
            playlistId: playlistId,
            videos: videoList,
            server: server
        });

        if (!streamResult.success) {
            // Se falhou, remover o registro de stream
            await supabase
                .from('streams')
                .delete()
                .eq('id', newStream.id);
            
            return res.status(500).json({ 
                error: 'Erro ao iniciar transmissão no Wowza',
                details: streamResult.error
            });
        }

        // Atualizar stream como ativo
        const { data: updatedStream } = await supabase
            .from('streams')
            .update({
                is_live: true,
                bitrate: streamResult.bitrate || 0
            })
            .eq('id', newStream.id)
            .select()
            .single();

        res.json({
            success: true,
            stream: updatedStream,
            wowzaData: streamResult.data,
            message: 'Transmissão iniciada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao iniciar transmissão:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

// Parar transmissão
router.post('/stop', supabaseAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { streamId } = req.body;

        // Buscar stream ativa
        let query = supabase
            .from('streams')
            .select('*')
            .eq('user_id', userId)
            .eq('is_live', true);

        if (streamId) {
            query = query.eq('id', streamId);
        }

        const { data: activeStream } = await query.single();

        if (!activeStream) {
            return res.status(404).json({ error: 'Nenhuma transmissão ativa encontrada' });
        }

        // Parar transmissão no Wowza
        const wowzaService = new WowzaStreamingService();
        const stopResult = await wowzaService.stopStream(activeStream.id);

        // Atualizar stream como inativa
        const { data: updatedStream } = await supabase
            .from('streams')
            .update({
                is_live: false,
                viewers: 0,
                bitrate: 0
            })
            .eq('id', activeStream.id)
            .select()
            .single();

        res.json({
            success: true,
            stream: updatedStream,
            wowzaResult: stopResult,
            message: 'Transmissão parada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao parar transmissão:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

// Obter status da transmissão
router.get('/status', supabaseAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: activeStream } = await supabase
            .from('streams')
            .select(`
                *,
                servers (
                    nome,
                    ip,
                    nome_principal
                )
            `)
            .eq('user_id', userId)
            .eq('is_live', true)
            .single();

        if (!activeStream) {
            return res.json({
                isLive: false,
                stream: null
            });
        }

        // Buscar estatísticas do Wowza
        const wowzaService = new WowzaStreamingService();
        const stats = await wowzaService.getStreamStats(activeStream.id);

        res.json({
            isLive: true,
            stream: activeStream,
            stats: stats
        });

    } catch (error) {
        console.error('Erro ao obter status:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

// Listar transmissões do usuário
router.get('/history', supabaseAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10 } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { data: streams, error } = await supabase
            .from('streams')
            .select(`
                *,
                servers (
                    nome,
                    ip,
                    nome_principal
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (error) throw error;

        res.json({
            streams: streams || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: streams?.length || 0
            }
        });

    } catch (error) {
        console.error('Erro ao listar histórico:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

// Atualizar estatísticas da transmissão
router.put('/stats/:streamId', supabaseAuthMiddleware, async (req, res) => {
    try {
        const { streamId } = req.params;
        const { viewers, bitrate, uptime } = req.body;
        const userId = req.user.id;

        const { data: updatedStream, error } = await supabase
            .from('streams')
            .update({
                viewers: viewers || 0,
                bitrate: bitrate || 0,
                uptime: uptime || '00:00:00',
                updated_at: new Date().toISOString()
            })
            .eq('id', streamId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            stream: updatedStream
        });

    } catch (error) {
        console.error('Erro ao atualizar estatísticas:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

export default router;