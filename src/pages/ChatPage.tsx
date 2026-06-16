/**
 * @file src/pages/ChatPage.tsx
 * @description Private direct message chat page for TrendHub
 * Uses Supabase Realtime channel for live message updates
 * Assumption: Each conversation = pair of user IDs (canonical order for dedup)
 * @author TrendHub Engineering
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Send,
  Loader2,
  ArrowLeft,
  MessageCircle,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Profile, Message } from "@/lib/database.types";

interface Conversation {
  profile: Profile;
  lastMessage: Message | null;
  unread: number;
}

export default function ChatPage() {
  const { user, profile: myProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const initialWith = searchParams.get("with");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [convLoading, setConvLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setConvLoading(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    const msgs = (data as Message[]) || [];

    // Group by other user
    const peerMap = new Map<string, Message[]>();
    for (const msg of msgs) {
      const peer = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!peerMap.has(peer)) peerMap.set(peer, []);
      peerMap.get(peer)!.push(msg);
    }

    // Fetch profiles for each peer
    const peerIds = Array.from(peerMap.keys());
    const convList: Conversation[] = [];

    if (peerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", peerIds);

      for (const profile of (profiles as Profile[]) || []) {
        const peerMsgs = peerMap.get(profile.id) || [];
        const unread = peerMsgs.filter(
          (m) => m.sender_id !== user.id && !m.read
        ).length;
        convList.push({
          profile,
          lastMessage: peerMsgs[0] || null,
          unread,
        });
      }
    }

    setConversations(convList.sort((a, b) =>
      new Date(b.lastMessage?.created_at || 0).getTime() -
      new Date(a.lastMessage?.created_at || 0).getTime()
    ));
    setConvLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Open conversation from URL param
  useEffect(() => {
    if (initialWith && user) {
      supabase
        .from("profiles")
        .select("*")
        .eq("id", initialWith)
        .single()
        .then(({ data }) => {
          if (data) setSelectedUser(data as Profile);
        });
    }
  }, [initialWith, user]);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async () => {
    if (!user || !selectedUser) return;
    setLoading(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    setMessages((data as Message[]) || []);

    // Mark as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("sender_id", selectedUser.id)
      .eq("receiver_id", user.id)
      .eq("read", false);

    setLoading(false);
  }, [user, selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
    }
  }, [selectedUser, fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`chat-room-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Message | undefined;
          const oldMsg = payload.old as Message | undefined;

          const isInCurrentConversation =
            !!selectedUser &&
            ((msg?.sender_id === user.id && msg?.receiver_id === selectedUser.id) ||
              (msg?.sender_id === selectedUser.id && msg?.receiver_id === user.id) ||
              (oldMsg?.sender_id === user.id && oldMsg?.receiver_id === selectedUser.id) ||
              (oldMsg?.sender_id === selectedUser.id && oldMsg?.receiver_id === user.id));

          if (!isInCurrentConversation) return;

          if (payload.eventType === "INSERT" && msg) {
            setMessages((prev) =>
              prev.some((existing) => existing.id === msg.id)
                ? prev
                : [...prev, msg]
            );
            fetchConversations();
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }

          if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as Message;
            setMessages((prev) =>
              prev.map((existing) =>
                existing.id === updatedMsg.id ? updatedMsg : existing
              )
            );
            fetchConversations();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedUser, fetchConversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || !selectedUser) return;

    const content = text.trim();
    setText("");

    const { data } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: selectedUser.id,
        content,
        read: false,
      })
      .select()
      .single();

    if (data) {
      const msg = data as Message;
      setMessages((prev) =>
        prev.some((existing) => existing.id === msg.id) ? prev : [...prev, msg]
      );
      fetchConversations();
    }
  };

  // Search users to start new conversation
  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim() || !user) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("id", user.id)
      .limit(5);

    setSearchResults((data as Profile[]) || []);
  };

  const myName = myProfile?.display_name || myProfile?.username || "Eu";

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] lg:h-screen flex">
      {/* Sidebar: Conversations */}
      <div
        className={`${
          selectedUser ? "hidden lg:flex" : "flex"
        } w-full lg:w-80 flex-col border-r border-slate-800 bg-slate-950`}
      >
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white mb-3">Chat</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Buscar usuário..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
              {searchResults.map((u) => {
                const name = u.display_name || u.username;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setSearch("");
                      setSearchResults([]);
                    }}
                    className="flex items-center gap-3 w-full p-3 hover:bg-slate-800 transition-colors text-left"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.avatar_url || ""} />
                      <AvatarFallback className="text-xs">
                        {name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-white">{name}</p>
                      <p className="text-xs text-slate-500">@{u.username}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageCircle className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Nenhuma conversa ainda.</p>
              <p className="text-slate-600 text-xs mt-1">
                Busque por um usuário para começar
              </p>
            </div>
          ) : (
            conversations.map(({ profile: p, lastMessage, unread }) => (
              <button
                key={p.id}
                onClick={() => setSelectedUser(p)}
                className={`flex items-center gap-3 w-full p-4 hover:bg-slate-800 transition-colors text-left border-b border-slate-800/50 ${
                  selectedUser?.id === p.id ? "bg-slate-800" : ""
                }`}
              >
                <div className="relative">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={p.avatar_url || ""} />
                    <AvatarFallback>
                      {(p.display_name || p.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {p.display_name || p.username}
                  </p>
                  {lastMessage && (
                    <p className="text-xs text-slate-500 truncate">
                      {lastMessage.sender_id === user?.id ? "Você: " : ""}
                      {lastMessage.content}
                    </p>
                  )}
                </div>
                {lastMessage && (
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {formatDistanceToNow(new Date(lastMessage.created_at), {
                      locale: ptBR,
                      addSuffix: false,
                    })}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div
        className={`${
          selectedUser ? "flex" : "hidden lg:flex"
        } flex-1 flex-col bg-slate-950`}
      >
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-950">
              <button
                onClick={() => setSelectedUser(null)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Link to={`/user/${selectedUser.id}`}>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={selectedUser.avatar_url || ""} />
                  <AvatarFallback>
                    {(selectedUser.display_name || selectedUser.username)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Link
                to={`/user/${selectedUser.id}`}
                className="hover:text-cyan-400 transition-colors"
              >
                <p className="font-semibold text-white">
                  {selectedUser.display_name || selectedUser.username}
                </p>
                <p className="text-xs text-slate-500">@{selectedUser.username}</p>
              </Link>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Comece a conversa com{" "}
                  <strong className="text-slate-400">
                    {selectedUser.display_name || selectedUser.username}
                  </strong>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {!isMine && (
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={selectedUser.avatar_url || ""} />
                          <AvatarFallback className="text-[10px]">
                            {(selectedUser.display_name || selectedUser.username)
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-xs lg:max-w-md rounded-2xl px-3 py-2 ${
                          isMine
                            ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-tr-sm"
                            : "bg-slate-800 text-white rounded-tl-sm"
                        }`}
                      >
                        <p className="text-sm break-words">{msg.content}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            isMine ? "text-cyan-100" : "text-slate-500"
                          }`}
                        >
                          {formatDistanceToNow(new Date(msg.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSend}
              className="flex gap-3 p-4 border-t border-slate-800"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={myProfile?.avatar_url || ""} />
                <AvatarFallback className="text-xs">
                  {myName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Mensagem para ${selectedUser.display_name || selectedUser.username}...`}
                className="flex-1"
                maxLength={1000}
              />
              <Button
                type="submit"
                variant="gradient"
                size="icon"
                disabled={!text.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 flex items-center justify-center mx-auto">
                <MessageCircle className="h-8 w-8 text-slate-600" />
              </div>
              <p className="text-slate-400">
                Selecione uma conversa ou busque um usuário
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
