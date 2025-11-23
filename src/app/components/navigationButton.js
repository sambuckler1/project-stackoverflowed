import { useRouter } from 'next/router'; // "router hook" lets you navigate between pages

/*
    This is a generic navigation button.

    We could use this for the sign up, log in, and "Next page" buttons, which would mean
    they would all look the same. But we'd be able to get rid of loginButton.js and signUpButton.js

    Or we could have each of those buttons be their own thing allowing them all to look different. 
    Just another option
*/
export default function NavigationButton({ label, route }) {
  const router = useRouter();
  
  return (
    <button
      onClick={() => router.push(route)}
      style={{
        backgroundColor: 'green',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      {label}
    </button>
  );
}