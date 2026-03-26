import { createClient } from '@supabase/supabase-js'

// Corrected URL: .co instead of .com
const supabaseUrl = 'https://dhvnquuvfspnwayqmqtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRodm5xdXV2ZnNwbndheXFtcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjMyNjgsImV4cCI6MjA4OTc5OTI2OH0.OzOCpl0C48N0yuU1XV7bzoFjMIq1d8a1oY8qzpbNyGY'

// This creates the "bridge" we will use in all your other files
export const supabase = createClient(supabaseUrl, supabaseAnonKey)