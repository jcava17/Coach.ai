// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Trophy, Plus, LogOut, ShieldCheck, LineChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { format } from "date-fns";

// read envs (no "!" here)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PLAY_ICONS = [
  { id: "inside-run", label: "Inside Run" },
  { id: "outside-run", label: "Outside Run" },
  { id: "quick-pass", label: "Quick Pass" },
  { id: "screen", label: "Screen" },
  { id: "deep-shot", label: "Deep Shot" },
  { id: "qb-keep", label: "QB Keep" },
];

export default function CoachAI() {
  // create supabase only if envs exist
  const supabase = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }, []);

  // if no envs (usually on Vercel first deploy), show message instead of crashing
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
        <Card className="max-w-md w-full text-center space-y-3">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Trophy className="w-5 h-5" />
              Coach.AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2">
              App is deployed, but Supabase env vars aren’t set on Vercel.
            </p>
            <p className="text-xs text-muted-foreground">
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel → Settings → Environment Variables
              → Redeploy.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");

  const [plays, setPlays] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const [newPlayName, setNewPlayName] = useState("");
  const [newPlayIcon, setNewPlayIcon] = useState("inside-run");
  const [newOpponent, setNewOpponent] = useState("");
  const [newDate, setNewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const [yardageDialog, setYardageDialog] = useState<{
    open: boolean;
    play: any;
    yards: string;
  }>({ open: false, play: null, yards: "0" });
  const [recentCalls, setRecentCalls] = useState<any[]>([]);

  // load session
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      supabase.auth.onAuthStateChange((_e, s) => {
        setSession(s);
      });
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // load data when logged in
  useEffect(() => {
    if (!session) return;
    (async () => {
      await Promise.all([refreshPlays(), refreshGames(), refreshRecent()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeGameId]);

  const refreshPlays = async () => {
    const { data, error } = await supabase.from("plays").select("id,name,icon").order("name");
    if (error) toast.error(error.message);
    else setPlays(data || []);
  };

  const refreshGames = async () => {
    const { data, error } = await supabase
      .from("games")
      .select("id,opponent,game_date")
      .order("game_date", { ascending: false });
    if (error) toast.error(error.message);
    else {
      setGames(data || []);
      if (!activeGameId && data && data.length) setActiveGameId(data[0].id);
    }
  };

  const refreshRecent = async () => {
    if (!activeGameId) return;
    const { data, error } = await supabase
      .from("play_calls_view")
      .select("id,created_at,yards,play_name,icon,game_id")
      .eq("game_id", activeGameId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setRecentCalls(data || []);
  };

  const signUp = async () => {
    if (!email || !password || !teamName)
      return toast.error("Email, password, and team name are required");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) return toast.error(error.message);

    if (data.user) {
      toast.success("Sign-up successful. Now log in.");
    } else {
      toast.success("Check your inbox to confirm, then log in.");
    }
  };

  const signIn = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast.error(error.message);

    toast.success("Welcome back!");
    const user = data.user;
    if (!user) return;

    const { error: pErr } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, team_name: teamName || "My Team" }, { onConflict: "user_id" });

    if (pErr) {
      toast.error(`Profile save issue: ${pErr.message}`);
    }

    await Promise.all([refreshPlays(), refreshGames()]);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPlays([]);
    setGames([]);
    setActiveGameId(null);
    setRecentCalls([]);
  };

  const addPlay = async () => {
    if (!newPlayName.trim()) return toast.error("Play name required");
    const { error } = await supabase
      .from("plays")
      .insert({ name: newPlayName.trim(), icon: newPlayIcon });
    if (error) toast.error(error.message);
    else {
      setNewPlayName("");
      toast.success("Play added");
      refreshPlays();
    }
  };

  const deletePlay = async (id: string) => {
    if (!confirm("Delete this play? All recorded calls for it may be removed.")) return;
    const { error } = await supabase.from("plays").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Play deleted");
    await Promise.all([refreshPlays(), refreshRecent()]);
  };

  const addGame = async () => {
    if (!newOpponent.trim()) return toast.error("Opponent required");
    const { data, error } = await supabase
      .from("games")
      .insert({ opponent: newOpponent.trim(), game_date: newDate })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    setNewOpponent("");
    toast.success("Game created");
    await refreshGames();
    if (data?.id) setActiveGameId(data.id);
  };

  const recordPlayCall = async () => {
    if (!yardageDialog.play) return toast.error("No play selected.");
    if (!activeGameId) return toast.error("Pick or create a game first.");

    const raw = (yardageDialog.yards ?? "").trim();
    if (!/^-?\d+$/.test(raw)) return toast.error("Enter a whole number (no decimals).");
    const yards = Number(raw);
    if (!Number.isFinite(yards) || yards < -99 || yards > 99)
      return toast.error("Yards must be between -99 and 99");

    const { error } = await supabase
      .from("play_calls")
      .insert({ play_id: yardageDialog.play.id, game_id: activeGameId, yards });

    if (error) return toast.error(error.message);

    toast.success("Play saved");
    setYardageDialog({ open: false, play: null, yards: "0" });
    await refreshRecent();
  };

  const perPlayStats = useMemo(() => {
    const m = new Map<string, { count: number; sum: number }>();
    for (const r of recentCalls) {
      const k = r.play_name;
      if (!m.has(k)) m.set(k, { count: 0, sum: 0 });
      const v = m.get(k)!;
      v.count += 1;
      v.sum += r.yards;
    }
    return Array.from(m.entries()).map(([name, v]) => ({
      name,
      count: v.count,
      avg: (v.sum / v.count).toFixed(1),
    }));
  }, [recentCalls]);

  if (loading) return <div className="p-6">Loading…</div>;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="w-5 h-5" />
              Coach.AI — Team Login
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@team.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="grid gap-2">
              <Label>Team Name (sign-up only)</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ann Arbor Eagles"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" type="button" onClick={signUp}>
                Sign up
              </Button>
              <Button className="flex-1" type="button" variant="outline" onClick={signIn}>
                Log in
              </Button>
            </div>
            <div className="text-xs text-muted-foreground pt-2 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> Supabase Auth + RLS secure per team.
            </div>
          </CardContent>
        </Card>
        <Toaster richColors />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-semibold">
          <Trophy className="w-5 h-5" /> Coach.AI
        </div>
        <Button size="sm" variant="outline" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-1" />
          Logout
        </Button>
      </div>

      {/* Plays */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Your Plays</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              className="flex-1"
              placeholder="e.g., Trips Right Flood"
              value={newPlayName}
              onChange={(e) => setNewPlayName(e.target.value)}
            />
            <Select value={newPlayIcon} onValueChange={setNewPlayIcon}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAY_ICONS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addPlay}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {plays.map((pl) => (
              <button
                key={pl.id}
                className="p-3 rounded-2xl border hover:shadow text-left"
                onClick={() => setYardageDialog({ open: true, play: pl, yards: "0" })}
              >
                <div className="font-medium">{pl.name}</div>
                <div className="text-xs text-muted-foreground">Tap to record</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Games quick create */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <Input
              placeholder="Opponent name"
              value={newOpponent}
              onChange={(e) => setNewOpponent(e.target.value)}
            />
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <Button onClick={addGame}>Create</Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGameId(g.id)}
                className={`px-3 py-2 rounded-xl border ${
                  activeGameId === g.id ? "bg-neutral-100" : "bg-white"
                }`}
              >
                <div className="text-sm font-medium">vs {g.opponent}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(g.game_date + "T00:00:00"), "MMM d, yyyy")}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent + simple stats */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LineChart className="w-4 h-4" />
              Recent (last 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentCalls.length === 0 && (
                <div className="text-sm text-muted-foreground">No data yet.</div>
              )}
              {recentCalls.map((rc) => (
                <div
                  key={rc.id}
                  className="flex items-center justify-between text-sm border rounded-xl p-2"
                >
                  <div>
                    <div className="font-medium leading-tight">{rc.play_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(rc.created_at), "h:mma")}
                    </div>
                  </div>
                  <div className={`font-semibold ${rc.yards >= 0 ? "" : "text-red-600"}`}>
                    {rc.yards} yds
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-play Avg (recent)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {perPlayStats.length === 0 && (
                <div className="text-sm text-muted-foreground">No stats yet.</div>
              )}
              {perPlayStats.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between border rounded-xl p-2 text-sm"
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">{s.count} calls</div>
                  <div className="font-semibold">{s.avg} yds</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Yardage dialog */}
      <Dialog
        open={yardageDialog.open}
        onOpenChange={(o) => setYardageDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Yards — {yardageDialog.play?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Yards gained (−99 to 99)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={yardageDialog.yards}
              onChange={(e) =>
                setYardageDialog((d) => ({
                  ...d,
                  yards: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="destructive"
              onClick={() => yardageDialog.play && deletePlay(yardageDialog.play.id)}
            >
              Delete play
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setYardageDialog({ open: false, play: null, yards: "0" })}
              >
                Cancel
              </Button>
              <Button onClick={recordPlayCall}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster richColors />
    </div>
  );
}




