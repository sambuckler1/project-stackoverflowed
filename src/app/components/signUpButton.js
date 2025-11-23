import { useRouter } from 'next/router';

export default function SignUpButton() {
  const router = useRouter();

  const handleClick = () => {
    router.push('/signUpPage');
  };

  return (
    <>
      <span className="signup-link" onClick={handleClick}>
        Sign Up
      </span>

      <style jsx>{`
        .signup-link {
          color: #ffffff;
          text-decoration: underline;
          font-size: 0.9rem;   /* smaller text */
          cursor: pointer;
          opacity: 0.85;
          transition: opacity 0.2s ease;
        }
        .signup-link:hover {
          opacity: 1;
        }
      `}</style>
    </>
  );
}
