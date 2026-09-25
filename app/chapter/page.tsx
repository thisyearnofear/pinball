"use client";
import dynamic from "next/dynamic";
const GameScreen = dynamic(() => import("@/game/GameScreen"), {
  ssr: false,
  loading: () => <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f5efe6", padding: 32 }}>Opening the shrine...</main>,
});
export default function Page() { return <GameScreen initialStory />; }
