import { useEffect, useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

export default function Products() {
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('Checking sandbox…');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStage('Checking sandbox…');
        const checkRes = await fetch(`${API_BASE}/spapi/sandbox-check`);
        const check = await checkRes.json();
        if (!checkRes.ok) throw new Error(check?.error || 'Sandbox check failed');

        if (cancelled) return;

        setStage('Loading products…');
        const prodRes = await fetch(`${API_BASE}/spapi/products`);
        const prod = await prodRes.json();
        if (!prodRes.ok) throw new Error(prod?.error || 'Failed to fetch products');

        if (cancelled) return;

        setData(prod);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) return <p style={{ color: 'white' }}>{stage}</p>;
  if (error) {
    return (
      <div style={{ color: '#ffb4b4' }}>
        <p>Oops: {error}</p>
        <button
          onClick={() => location.reload()}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #fff3',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const items = data?.payload || data?.items || [];
  const isList = Array.isArray(items) && items.length > 0;

  return (
    <section>
      <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Products (Sandbox)</h3>
      {isList ? (
        <ul style={{ color: 'white', lineHeight: 1.6 }}>
          {items.map((p, idx) => (
            <li key={idx}>
              {p?.sku || p?.sellerSku || 'SKU?'} — {p?.attributes?.item_name || p?.itemName || 'Unnamed'}
            </li>
          ))}
        </ul>
      ) : (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: 'rgba(255,255,255,0.06)',
            color: 'white',
            padding: 12,
            borderRadius: 8,
            overflowX: 'auto'
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </section>
  );
}
