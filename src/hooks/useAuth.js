import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../services/supabase'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [error, setError] = useState(null)

  const loadProfile = useCallback(async (nextSession) => {
    if (!nextSession?.user) {
      setSession(null)
      setProfile(null)
      setLoading(false)
      return { error: null }
    }

    setSession(nextSession)
    let data
    let profileError
    try {
      const result = await supabase
        .from('profiles')
        .select('id, full_name, role, active')
        .eq('id', nextSession.user.id)
        .maybeSingle()
      data = result.data
      profileError = result.error
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo consultar el perfil.')
      setProfile(null)
      setLoading(false)
      return { error: requestError }
    }
    if (profileError) {
      setError(profileError.message)
      setProfile(null)
      setLoading(false)
      return { error: profileError }
    }
    if (!data?.active) {
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
      setError('La cuenta está desactivada o no tiene un perfil activo.')
      setLoading(false)
      return { error: new Error('La cuenta está desactivada o no tiene un perfil activo.') }
    }
    setProfile({ ...data, email: nextSession.user.email || '' })
    setError(null)
    setLoading(false)
    return { error: null }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) return undefined
    let active = true
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (active) loadProfile(nextSession)
      }, 0)
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      loadProfile(data.session)
    }).catch((sessionError) => {
      if (!active) return
      setError(sessionError instanceof Error ? sessionError.message : 'No se pudo recuperar la sesión.')
      setLoading(false)
    })
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return { error: signInError }
      }
      return await loadProfile(data.session)
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'No se pudo iniciar sesión.')
      setLoading(false)
      return { error: signInError }
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) setError(signOutError.message)
      else {
        setSession(null)
        setProfile(null)
      }
      return { error: signOutError }
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'No se pudo cerrar sesión.')
      return { error: signOutError }
    }
  }, [])

  return {
    session,
    profile,
    loading,
    error,
    signIn,
    signOut,
    refreshProfile: () => loadProfile(session),
  }
}
