/**
 * @file src/pages/NewPostPage.tsx
 * @description Create new post with text, image URL, or video URL support
 * All posts are linked to auth.uid() via author_id RLS
 * @author TrendHub Engineering
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Image, Video, Type, ArrowLeft, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import type { Community } from "@/lib/database.types";

type MediaType = "none" | "image" | "video";

export default function NewPostPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { addToast } = useToast();

  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [mediaUrl, setMediaUrl] = useState("");
  const [communityId, setCommunityId] = useState("none");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);

  const MAX_CHARS = 500;

  useEffect(() => {
    const fetchCommunities = async () => {
      if (!user) return;
      // Fetch communities the user is a member of or creator
      const { data } = await supabase
        .from("community_members")
        .select("communities(*)")
        .eq("user_id", user.id);

      if (data) {
        const comms = data
          .map((d) => (d as { communities: Community }).communities)
          .filter(Boolean);
        setCommunities(comms);
      }
    };
    fetchCommunities();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const hasMedia = mediaType !== "none" && mediaUrl.trim();
    const hasContent = content.trim().length > 0;

    if (!hasContent && !hasMedia) {
      addToast({ type: "error", title: "Digite algo ou adicione uma imagem/vídeo" });
      return;
    }

    if (content.length > MAX_CHARS) {
      addToast({ type: "error", title: `Máximo de ${MAX_CHARS} caracteres` });
      return;
    }

    setLoading(true);

    const payload: {
      author_id: string;
      content: string;
      media_url?: string;
      media_type?: "image" | "video";
      community_id?: string;
    } = {
      author_id: user.id,
      content: content.trim(),
    };

    if (mediaType !== "none" && mediaUrl.trim()) {
      payload.media_url = mediaUrl.trim();
      payload.media_type = mediaType;
    }

    if (communityId && communityId !== "none") {
      payload.community_id = communityId;
    }

    const { error } = await supabase.from("posts").insert(payload);

    if (error) {
      addToast({ type: "error", title: "Erro ao criar post", description: error.message });
    } else {
      addToast({ type: "success", title: "Post publicado! 🚀" });
      navigate("/feed");
    }
    setLoading(false);
  };

  const authorName = profile?.display_name || profile?.username || "Usuário";
  const charsLeft = MAX_CHARS - content.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-white">Nova Post</h1>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
        <div className="flex gap-3 mb-4">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback>{authorName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-white">{authorName}</p>
            <p className="text-xs text-slate-500">@{profile?.username}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Content */}
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="O que está acontecendo? Compartilhe sua trend... 🔥"
              className="min-h-[120px] text-base resize-none"
              maxLength={MAX_CHARS}
              autoFocus
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">
                Máximo de {MAX_CHARS} caracteres
              </span>
              <span
                className={`text-xs font-medium ${
                  charsLeft < 50
                    ? charsLeft < 20
                      ? "text-red-400"
                      : "text-amber-400"
                    : "text-slate-500"
                }`}
              >
                {charsLeft} restantes
              </span>
            </div>
          </div>

          {/* Media type selector */}
          <div className="space-y-2">
            <Label>Tipo de mídia (opcional)</Label>
            <div className="flex gap-2">
              {(["none", "image", "video"] as MediaType[]).map((type) => {
                const icons = { none: Type, image: Image, video: Video };
                const labels = { none: "Só texto", image: "Imagem (URL)", video: "Vídeo (URL)" };
                const Icon = icons[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMediaType(type);
                      setMediaUrl("");
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                      mediaType === type
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                        : "border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{labels[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media URL input */}
          {mediaType !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="mediaUrl">
                URL da {mediaType === "image" ? "imagem" : "vídeo"}
              </Label>
              <Input
                id="mediaUrl"
                type="url"
                placeholder={
                  mediaType === "image"
                    ? "https://exemplo.com/imagem.jpg"
                    : "https://youtube.com/watch?v=..."
                }
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
              {mediaType === "video" && (
                <p className="text-xs text-slate-400">
                  💡 Dicas: Cole a URL do YouTube (youtube.com/watch?v=...), Vimeo (vimeo.com/...), ou qualquer vídeo MP4
                </p>
              )}
            </div>
          )}
          {/* Community selector */}
          <div className="space-y-2">
            <Label>Comunidade (opcional)</Label>
            <Select value={communityId} onValueChange={setCommunityId}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhuma comunidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma comunidade</SelectItem>
                {communities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {communities.length === 0 && (
              <p className="text-xs text-slate-500">
                Participe de uma comunidade para postar nela.
              </p>
            )}
          </div>

          {/* Preview */}
          {mediaType === "image" && mediaUrl && (
            <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
              <img
                src={mediaUrl}
                alt="Preview"
                className="w-full max-h-64 object-cover"
                onError={(e) =>
                  ((e.target as HTMLImageElement).style.display = "none")
                }
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={
                loading || (!content.trim() && !(mediaType !== "none" && mediaUrl.trim()))
              }
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {loading ? "Publicando..." : "Publicar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
