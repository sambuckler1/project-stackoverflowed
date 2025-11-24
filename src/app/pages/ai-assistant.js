import dynamic from "next/dynamic";
import NavBar from "../components/navBar";

const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});

export default function AiAssistant() {
  return (
    <div className="dash-wrap">
      <StarsBackground count={240} />

      <main className="content">
        <NavBar />

        <div className="card coming-soon-card">
          <h1 className="title">AI Assistant</h1>
          <p className="subtitle">🚧 Coming Soon 🚧</p>
        </div>
      </main>

      <style jsx>{`
        .coming-soon-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
          font-size: 1.4rem;
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
