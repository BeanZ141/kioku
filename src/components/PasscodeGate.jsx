import { useState } from 'react'
import { unlock } from '../firebase'
import logo from '../assets/logo.png'

export default function PasscodeGate({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await unlock(value)
      onUnlock()
    } catch (err) {
      setError(err.message || 'Unable to open archive.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="gate">
      <img src={logo} className="gate-logo" alt="logo" />
      <h1>kioku archive</h1>
      <form onSubmit={submit}>
        <label htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        {error && <p className="form-error">{error}</p>}
        <button className="ink-button" disabled={loading}>
          {loading ? 'Opening...' : 'Open'}
        </button>
      </form>
    </main>
  )
}
