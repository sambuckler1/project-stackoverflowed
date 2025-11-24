export default function LinkAccountButton() {
  const handleClick = () => {
    const width = 500;
    const height = 500;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const amazonLoginUrl = `https://www.amazon.com/ap/oa
      ?client_id=YOUR_CLIENT_ID                                
      &scope=sellingpartnerapi::migration
      &response_type=code
      &redirect_uri=http://localhost:5001/auth/callback`;

    // Opens popup window pointing to amazons login + authorization page
    window.open(
      amazonLoginUrl,
      'AmazonLogin',
      `width=${width},height=${height},top=${top},left=${left}`
    );
  };

  return (
    <button
      onClick={handleClick}
      style={{ 
        backgroundColor: 'blue', 
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
      Link Amazon FBA Account
    </button>
  );
}