import { useEffect, useState } from "react";

type Playlist = {
  id: number;
  nome: string;
};

type Video = {
  id: number;
  nome: string;
  playlist_id: number;
  duracao?: number; // duração em segundos
};

function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GerenciarVideos() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistSelecionada, setPlaylistSelecionada] = useState<Playlist | null>(null);
  const [novoPlaylistNome, setNovoPlaylistNome] = useState("");
  const [editPlaylistId, setEditPlaylistId] = useState<number | null>(null);
  const [editPlaylistNome, setEditPlaylistNome] = useState("");

  const [videos, setVideos] = useState<Video[]>([]);
  const [editVideoId, setEditVideoId] = useState<number | null>(null);
  const [editVideoNome, setEditVideoNome] = useState("");

  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  useEffect(() => {
    if (playlistSelecionada) {
      fetchVideos(playlistSelecionada.id);
    } else {
      setVideos([]);
    }
  }, [playlistSelecionada]);

  const fetchPlaylists = () => {
    fetch("http://localhost:3001/api/playlists")
      .then((res) => res.json())
      .then((data) => {
        setPlaylists(data);
        if (data.length > 0) setPlaylistSelecionada(data[0]);
      })
      .catch(console.error);
  };

  const fetchVideos = (playlist_id: number) => {
    fetch(`http://localhost:3001/api/videos?playlist_id=${playlist_id}`)
      .then((res) => res.json())
      .then((videosAPI: Video[]) => {
        // Aqui vídeos do backend não têm duração, podemos deixar vazio ou buscar depois
        setVideos(videosAPI);
      })
      .catch(console.error);
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const videosOnly = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (videosOnly.length !== files.length) {
      alert("Apenas arquivos de vídeo são permitidos.");
      e.target.value = "";
      setUploadFiles(null);
      return;
    }
    setUploadFiles(files);
  };

  // Função para extrair duração de um arquivo File
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  const uploadVideos = async () => {
    if (!playlistSelecionada || !uploadFiles || uploadFiles.length === 0) {
      alert("Selecione uma playlist e ao menos um arquivo para upload.");
      return;
    }
    setUploading(true);

    try {
      // Extrair duração dos vídeos antes do upload
      const videosComDuracao = await Promise.all(
        Array.from(uploadFiles).map(async (file) => {
          const duracao = await getVideoDuration(file);
          return {
            nome: file.name,
            duracao,
          };
        })
      );

      // Enviar para backend
      const formData = new FormData();
      for (let i = 0; i < uploadFiles.length; i++) {
        formData.append("videos", uploadFiles[i]);
      }
      formData.append("playlist_id", playlistSelecionada.id.toString());

      const res = await fetch("http://localhost:3001/api/videos/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro ao enviar vídeos");

      // Atualizar lista com os vídeos já existentes + os novos, simulando IDs únicos
      // Normalmente você deve receber IDs do backend, aqui só simulamos temporariamente
      setVideos((oldVideos) => [
        ...oldVideos,
        ...videosComDuracao.map((v, idx) => ({
          id: Date.now() + idx,
          nome: v.nome,
          playlist_id: playlistSelecionada.id,
          duracao: v.duracao,
        })),
      ]);

      setUploadFiles(null);
      const inputFile = document.getElementById("input-upload-videos") as HTMLInputElement | null;
      if (inputFile) inputFile.value = "";
    } catch (error) {
      console.error(error);
      alert("Falha no upload de vídeos");
    } finally {
      setUploading(false);
    }
  };

  const criarPlaylist = () => {
    if (!novoPlaylistNome.trim()) return;
    const nova = { id: Date.now(), nome: novoPlaylistNome.trim() };
    setPlaylists((prev) => [...prev, nova]);
    setNovoPlaylistNome("");
  };

  const iniciarEdicaoPlaylist = (playlist: Playlist) => {
    setEditPlaylistId(playlist.id);
    setEditPlaylistNome(playlist.nome);
  };

  const salvarEdicaoPlaylist = () => {
    if (!editPlaylistNome.trim() || editPlaylistId === null) return;
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === editPlaylistId ? { ...pl, nome: editPlaylistNome.trim() } : pl
      )
    );
    if (playlistSelecionada?.id === editPlaylistId) {
      setPlaylistSelecionada({ id: editPlaylistId, nome: editPlaylistNome.trim() });
    }
    setEditPlaylistId(null);
    setEditPlaylistNome("");
  };

  const cancelarEdicaoPlaylist = () => {
    setEditPlaylistId(null);
    setEditPlaylistNome("");
  };

  const deletarPlaylist = (id: number) => {
    if (!confirm("Confirma a exclusão da playlist?")) return;
    setPlaylists((prev) => prev.filter((pl) => pl.id !== id));
    if (playlistSelecionada?.id === id) {
      setPlaylistSelecionada(null);
      setVideos([]);
    }
  };

  const iniciarEdicaoVideo = (video: Video) => {
    setEditVideoId(video.id);
    setEditVideoNome(video.nome);
  };

  const salvarEdicaoVideo = () => {
    if (!editVideoNome.trim() || editVideoId === null) return;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === editVideoId ? { ...v, nome: editVideoNome.trim() } : v
      )
    );
    setEditVideoId(null);
    setEditVideoNome("");
  };

  const cancelarEdicaoVideo = () => {
    setEditVideoId(null);
    setEditVideoNome("");
  };

  const deletarVideo = (id: number) => {
    if (!confirm("Confirma a exclusão do vídeo?")) return;
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto p-4 flex flex-col md:flex-row gap-6 min-h-[600px]">
      <section className="md:w-1/3 bg-white p-5 rounded-lg shadow-md flex flex-col">
        <h2 className="text-2xl font-semibold mb-5 text-gray-800">Playlists</h2>
        <ul className="flex-grow overflow-auto max-h-[400px] space-y-2">
          {playlists.map((playlist) =>
            editPlaylistId === playlist.id ? (
              <li key={playlist.id} className="flex gap-2 items-center">
                <input
                  className="flex-grow border border-gray-300 rounded px-3 py-2 focus:outline-blue-500"
                  value={editPlaylistNome}
                  onChange={(e) => setEditPlaylistNome(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && salvarEdicaoPlaylist()}
                />
                <button
                  className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition"
                  onClick={salvarEdicaoPlaylist}
                  title="Salvar edição"
                >
                  ✓
                </button>
                <button
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition"
                  onClick={cancelarEdicaoPlaylist}
                  title="Cancelar edição"
                >
                  ✕
                </button>
              </li>
            ) : (
              <li
                key={playlist.id}
                className={`flex justify-between items-center p-3 rounded cursor-pointer select-none
                  ${
                    playlistSelecionada?.id === playlist.id
                      ? "bg-blue-200 font-semibold"
                      : "hover:bg-blue-50"
                  }`}
                onClick={() => setPlaylistSelecionada(playlist)}
                title={`Selecionar playlist ${playlist.nome}`}
              >
                <span>{playlist.nome}</span>
                <span className="flex gap-2">
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      iniciarEdicaoPlaylist(playlist);
                    }}
                    aria-label="Editar playlist"
                  >
                    ✏️
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletarPlaylist(playlist.id);
                    }}
                    aria-label="Excluir playlist"
                  >
                    🗑️
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            className="flex-grow border border-gray-300 rounded px-3 py-2 focus:outline-blue-500"
            placeholder="Nova playlist..."
            value={novoPlaylistNome}
            onChange={(e) => setNovoPlaylistNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criarPlaylist()}
          />
          <button
            className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700 transition"
            onClick={criarPlaylist}
          >
            +
          </button>
        </div>
      </section>

      <section className="md:w-2/3 bg-white p-5 rounded-lg shadow-md flex flex-col">
        <h2 className="text-2xl font-semibold mb-5 text-gray-800">
          Vídeos da playlist:{" "}
          <span className="font-normal text-gray-600">
            {playlistSelecionada?.nome ?? "-"}
          </span>
        </h2>

        <div className="mb-4 flex items-center gap-4">
          <input
            id="input-upload-videos"
            type="file"
            accept="video/*"
            multiple
            onChange={handleFilesChange}
            disabled={!playlistSelecionada || uploading}
            className="border border-gray-300 rounded px-3 py-2 cursor-pointer"
          />
          <button
            onClick={uploadVideos}
            disabled={!uploadFiles || uploadFiles.length === 0 || uploading}
            className={`px-5 py-2 rounded text-white ${
              !uploadFiles || uploadFiles.length === 0 || uploading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            } transition`}
          >
            {uploading ? "Enviando..." : "Enviar vídeos"}
          </button>
        </div>

        <ul className="flex-grow overflow-auto max-h-[400px] space-y-3 border border-gray-200 rounded p-3">
          {videos.map((video) =>
            editVideoId === video.id ? (
              <li key={video.id} className="flex gap-2 items-center">
                <input
                  className="flex-grow border border-gray-300 rounded px-3 py-2 focus:outline-blue-500"
                  value={editVideoNome}
                  onChange={(e) => setEditVideoNome(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && salvarEdicaoVideo()}
                />
                <button
                  className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition"
                  onClick={salvarEdicaoVideo}
                  title="Salvar edição"
                >
                  ✓
                </button>
                <button
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition"
                  onClick={cancelarEdicaoVideo}
                  title="Cancelar edição"
                >
                  ✕
                </button>
              </li>
            ) : (
              <li
                key={video.id}
                className="flex justify-between items-center p-3 rounded bg-gray-50 hover:bg-gray-100 select-none"
              >
                <span>
                  {video.nome}{" "}
                  {video.duracao !== undefined && (
                    <small className="text-gray-500 ml-2">[{formatarDuracao(video.duracao)}]</small>
                  )}
                </span>
                <span className="flex gap-2">
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    onClick={() => iniciarEdicaoVideo(video)}
                    aria-label="Editar vídeo"
                  >
                    ✏️
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
                    onClick={() => deletarVideo(video.id)}
                    aria-label="Excluir vídeo"
                  >
                    🗑️
                  </button>
                </span>
              </li>
            )
          )}
          {videos.length === 0 && (
            <li className="text-center text-gray-500">Nenhum vídeo nesta playlist.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
