export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>React Deploy Template</h1>
      <p style={{ marginTop: 12, color: '#444', maxWidth: 720 }}>
        Build locally with <code>npm run dev</code> and deploy with the provided Vercel config.
      </p>
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => alert('Hello from React!')}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Click me
        </button>
      </div>
    </div>
  )
}

