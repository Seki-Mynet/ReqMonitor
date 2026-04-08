import { useEffect, useState } from 'react'

function App() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('http://localhost:5000/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
  }, [])

  return (
    <div>
      <h1>Frontend (React + Vite)</h1>
      <p>Backend says: {message}</p>
    </div>
  )
}

export default App