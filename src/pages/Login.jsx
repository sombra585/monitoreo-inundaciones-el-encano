import { useState } from 'react'
import { LockKeyhole, LogIn } from 'lucide-react'

export default function Login({ onSignIn, onCancel, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    if (!email.trim() || !password) {
      setFormError('Ingresa tu correo y contraseña.')
      return
    }
    const result = await onSignIn(email.trim(), password)
    if (result?.error) setFormError(result.error.message)
    else onCancel()
  }

  return (
    <main className="page login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon"><LockKeyhole size={23} /></div>
        <p className="section-overline">ACCESO TÉCNICO</p>
        <h1>Iniciar sesión</h1>
        <p>Acceso para cuentas autorizadas del proyecto.</p>
        <label>Correo electrónico<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Contraseña<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {(formError || error) && <div className="login-error" role="alert">{formError || error}</div>}
        <button className="primary-button" type="submit" disabled={loading}><LogIn size={17} />{loading ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Volver al panel público</button>
        <small>No hay registro público. Solicita una invitación al administrador.</small>
      </form>
    </main>
  )
}
