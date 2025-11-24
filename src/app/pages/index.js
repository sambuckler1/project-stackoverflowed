import LoginButton from '../components/loginButton';
import SignUpButton from '../components/signUpButton';
import StarsBackground from '../components/StarsBackground';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'], // for bold headings
});

export default function Home() {
  return (
    <div className="home-wrap">
      {/* starfield behind everything */}
      <StarsBackground count={240} />

      <main className="content">
      <h1 className={`${spaceGrotesk.className} home-title`}> Welcome to FBAlgo</h1>

        <div className="button-group">
          <LoginButton />
          <SignUpButton />
        </div>
      </main>

      {/* page-specific styles */}
      <style jsx>{`
        .home-wrap {
          position: relative;
          min-height: 100vh;
          background: linear-gradient(135deg, #360f5a, #1c0333);
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .content {
          position: relative;
          z-index: 1; /* sit above stars */
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
          padding: 2rem;
        }
        .home-title {
            font-weight: 700;
            font-size: clamp(2.5rem, 4.5vw, 4rem);
            letter-spacing: 1px;
            color: #fff;
            text-shadow: 0 0 24px rgba(255,255,255,0.2),
                         0 2px 12px rgba(0,0,0,0.6);
          }
        .button-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .button-group :global(a),
        .button-group :global(.signup-link) {
          color: #fff;
          text-decoration: underline;
          font-weight: 500;
          opacity: 0.95;
        }
      `}</style>

      {/* global styles that fix the border */}
      <style jsx global>{`
        html, body, #__next {
          height: 100%;
          background: #1b0633; /* match your page bg so there’s no white flash */
        }
        body {
          margin: 0; /* <-- removes the white border */
          overscroll-behavior: none;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
