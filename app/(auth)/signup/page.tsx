import { createClient } from '@/lib/supabase/server'
import SignupForm, { type CampusOption } from './SignupForm'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_signup_campuses')
  const campuses: CampusOption[] = Array.isArray(data) ? (data as CampusOption[]) : []
  return <SignupForm campuses={campuses} />
}
