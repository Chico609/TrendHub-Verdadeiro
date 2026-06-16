/**
 * @file src/components/PostCard.tsx
 * @description Post card component with like, comment, and share functionality
 * Connects to Supabase for real-time interactions
 * @author TrendHub Engineering
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Play,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import type { PostWithAuthor } from "@/lib/database.types";
import { CommentsSection } from "./CommentsSection";

interface PostCardProps {
  post: PostWithAuthor;
  onDelete?: (id: string) => void;
  onLikeToggle?: (id: string, liked: boolean) => void;
}

export function PostCard({ post, onDelete, onLikeToggle }: PostCardProps) {
  const { user } = useAuthStore();
  const { addToast } = useToast();

  const isLiked = post.likes.some((l) => l.user_id === user?.id);
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(post.likes.length);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments.length);

  const handleLike = async () => {
    if (!user) return;

    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));
    onLikeToggle?.(post.id, newLiked);

    if (newLiked) {
      await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
    } else {
      await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id);
    }
  };

  const handleDelete = async () => {
    if (!user || user.id !== post.author_id) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      addToast({ type: "error", title: "Erro ao excluir post" });
    } else {
      addToast({ type: "success", title: "Post excluído" });
      onDelete?.(post.id);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    addToast({ type: "info", title: "Link copiado!" });
  };

  const authorName = post.profiles.display_name || post.profiles.username;
  const initials = authorName.slice(0, 2).toUpperCase();
  const isOwner = user?.id === post.author_id;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link to={`/user/${post.profiles.id}`}>
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profiles.avatar_url || ""} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Link
                to={`/user/${post.profiles.id}`}
                className="font-semibold text-white hover:text-cyan-400 transition-colors text-sm"
              >
                {authorName}
              </Link>
              {post.communities && (
                <Link to={`/communities/${post.communities.id}`}>
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    {post.communities.title}
                  </Badge>
                </Link>
              )}
            </div>
            <p className="text-xs text-slate-500">
              @{post.profiles.username} ·{" "}
              {formatDistanceToNow(new Date(post.created_at), {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>
          </div>
        </div>

        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Excluir post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      <p className="text-slate-200 text-sm leading-relaxed mb-3 whitespace-pre-wrap">
        {post.content}
      </p>

      {/* Media */}
      {post.media_url && post.media_type === "image" && (
        <div className="rounded-xl overflow-hidden mb-3 bg-slate-800">
          <img
            src={post.media_url}
            alt="Post media"
            className="w-full max-h-96 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {post.media_url && post.media_type === "video" && (
        <div className="rounded-xl overflow-hidden mb-3 bg-slate-800 aspect-video relative">
          {(() => {
            const getYouTubeId = (url: string) => {
              try {
                const urlObj = new URL(url);
                return urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop();
              } catch {
                return null;
              }
            };

            const youtubeId = getYouTubeId(post.media_url);
            const isYouTube =
              post.media_url.includes("youtube.com") ||
              post.media_url.includes("youtu.be");
            const isVimeo = post.media_url.includes("vimeo.com");

            if (isYouTube && youtubeId) {
              return (
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                  title="YouTube video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              );
            } else if (isVimeo) {
              const vimeoId = post.media_url
                .split("/")
                .filter((segment) => /^\d+$/.test(segment))
                .pop();
              return (
                <iframe
                  src={`https://player.vimeo.com/video/${vimeoId}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  className="w-full h-full"
                />
              );
            }

            return (
              <video
                src={post.media_url}
                controls
                controlsList="nodownload"
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.error("Video failed to load:", post.media_url);
                  (e.target as HTMLVideoElement).style.display = "none";
                }}
              />
            );
          })()}
        </div>
      )}
      <div className="flex items-center gap-1 pt-2 border-t border-slate-800">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
            liked
              ? "text-rose-400 bg-rose-500/10"
              : "text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-rose-400" : ""}`} />
          <span>{likeCount}</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{commentCount}</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all ml-auto"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <CommentsSection
          postId={post.id}
          onCountChange={setCommentCount}
        />
      )}
    </div>
  );
}
