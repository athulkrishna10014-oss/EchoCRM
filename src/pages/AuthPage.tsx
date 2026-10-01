import React, { useState } from 'react'
import { supabase } from '../supabase/client'
import { Eye, EyeOff, Mail, Lock, User, KeyRound, AlertCircle } from 'lucide-react'

export const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const validateForm = () => {
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.')
      return false
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.')
      return false
    }
    if (isSignUp && !name.trim()) {
      setErrorMessage('Please enter your name.')
      return false
    }
    return true
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    if (!validateForm()) return

    setLoading(true)

    try {
      if (isSignUp) {
        // Sign Up Flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name.trim(),
            },
          },
        })

        if (error) {
          throw error
        }

        // If email confirmation is required, inform the user
        if (data.session === null) {
          setInfoMessage('Registration successful! Please check your email inbox to confirm your account.')
        } else {
          setInfoMessage('Registration successful! Welcome to Echo CRM.')
        }
      } else {
        // Sign In Flow
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          throw error
        }
      }
    } catch (err: any) {
      // Map raw supabase errors to user friendly errors
      const msg = err?.message || ''
      if (msg.includes('Invalid login credentials')) {
        setErrorMessage('Incorrect email or password. Please try again.')
      } else if (msg.includes('User already registered')) {
        setErrorMessage('An account with this email address already exists.')
      } else if (msg.includes('Network connection lost') || msg.includes('Failed to fetch')) {
        setErrorMessage('Network error. Unable to reach authentication server.')
      } else {
        setErrorMessage('Authentication failed. Please verify your details and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#F7F4EE] relative overflow-hidden select-none">
      {/* Subtle warm ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#F0D8CA]/40 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#C59A5F]/15 blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md mx-4 p-6 sm:p-8 rounded-2xl bg-[#FFFDF9] border border-[#E8E1D8] relative z-10 shadow-sm transition-all duration-300">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-[#F0D8CA]/60 text-[#B85C38] rounded-2xl mb-4 border border-[#B85C38]/20">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#292522] font-display mb-1.5">Echo CRM</h1>
          <p className="text-xs text-[#817A72]">
            {isSignUp ? 'Create an account to get started with Echo CRM' : 'Sign in to access your sales workspace'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* Notifications */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/25 text-[#B94A48] text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#64866A]/10 border border-[#64866A]/25 text-[#64866A] text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-[#64866A] shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Name Field (Sign Up Only) */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#817A72] tracking-wide uppercase">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F7F4EE] border border-[#E8E1D8] focus:border-[#B85C38] focus:outline-none rounded-xl text-xs text-[#292522] placeholder-[#817A72] transition"
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] tracking-wide uppercase">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F7F4EE] border border-[#E8E1D8] focus:border-[#B85C38] focus:outline-none rounded-xl text-xs text-[#292522] placeholder-[#817A72] transition"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] tracking-wide uppercase">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-10 py-2.5 bg-[#F7F4EE] border border-[#E8E1D8] focus:border-[#B85C38] focus:outline-none rounded-xl text-xs text-[#292522] placeholder-[#817A72] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#817A72] hover:text-[#B85C38] transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 bg-[#B85C38] hover:bg-[#A04F30] active:bg-[#8D4428] text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow-sm transition-all duration-150 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="border-2 border-white border-t-transparent w-4 h-4 rounded-full animate-spin" />
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-6 text-center text-xs text-[#817A72]">
          <span>{isSignUp ? 'Already have an account? ' : "Don't have an account? "}</span>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErrorMessage(null)
              setInfoMessage(null)
            }}
            disabled={loading}
            className="text-[#B85C38] hover:text-[#A04F30] font-semibold focus:outline-none hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  )
}
