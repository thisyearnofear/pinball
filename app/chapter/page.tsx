"use client";
import dynamic from "next/dynamic";
const ShrineChapter = dynamic(() => import("@/game/chapter/ShrineChapter"), {
  ssr: false,
  loading: () => <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f5efe6", padding: 32 }}>Opening the water shrine...</main>,
});
export default function Page() { return <ShrineChapter />; }
