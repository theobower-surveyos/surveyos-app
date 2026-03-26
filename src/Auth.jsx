import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // New fields for employees joining a firm
  const [firstName, setFirstName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  
  const [loading, setLoading] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)

    if (isSignUp) {
      // 1. Create the secure login credentials
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      })

      if (authError) {
        alert(authError.message)
        setLoading(false)
        return
      }

      // 2. If login is created AND they have an invite code, print their ID badge!
      if (authData.user && inviteCode) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert([
            {
              id: authData.user.id,
              firm_id: inviteCode,
              first_name: firstName,
              role: 'field_crew' // Default role for new invites
            }
          ])

        if (profileError) {
          alert("Account created, but error linking to firm: " + profileError.message)
        } else {
          alert('Welcome to the crew! You are now linked to your firm.')
        }
      } else {
        alert('Account created! (No invite code provided).')
      }

    } else {
      // Standard Log In logic
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (error) alert(error.message)
    }
    
    setLoading(false)
  }

  return (
    <div style={{ padding: '50px', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid #ddd' }}>
        
        <h2 style={{ marginTop: 0 }}>SurveyOS Access</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          {isSignUp ? "Create your employee account to join a firm." : "Sign in to your firm's workspace."}
        </p>
        
        <form onSubmit={handleAuth}>
          
          {/* Only show Name and Invite Code if they are signing up */}
          {isSignUp && (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '0.9em' }}>First Name</label>
                <input 
                  type="text" 
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '0.9em' }}>Firm Invite Code</label>
                <input 
                  type="text" 
                  required
                  placeholder="Paste the code from your Admin"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.9em' }}>Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          
          <div style={{ marginBottom: '25px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.9em' }}>Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Processing...' : (isSignUp ? 'Join Firm' : 'Log In')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: '#0d6efd', textDecoration: 'underline', cursor: 'pointer' }}
          >
            {isSignUp ? "Already have an account? Log In" : "Need to join a firm? Sign Up"}
          </button>
        </div>

      </div>
    </div>
  )
}