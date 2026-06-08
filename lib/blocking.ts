import type { SupabaseClient } from '@supabase/supabase-js'

export interface BlockRecord {
  id: string
  blocked_id: string
  blocked_name: string | null
  reason: string
  created_at: string
}

export async function blockUser(
  supabase: SupabaseClient,
  targetId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; block_id?: string }> {
  const { data, error } = await supabase.rpc('block_user', {
    p_target_id: targetId,
    p_reason: reason,
  })
  if (error) return { ok: false, error: error.message }
  return data as { ok: boolean; error?: string; block_id?: string }
}

export async function unblockUser(
  supabase: SupabaseClient,
  blockId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('unblock_user', {
    p_block_id: blockId,
    p_reason: reason,
  })
  if (error) return { ok: false, error: error.message }
  return data as { ok: boolean; error?: string }
}

export async function getMyBlocks(supabase: SupabaseClient): Promise<BlockRecord[]> {
  const { data, error } = await supabase.rpc('get_my_blocks')
  if (error) return []
  return (data ?? []) as BlockRecord[]
}

export async function isBlockedBetween(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<boolean> {
  const { data } = await supabase.rpc('is_blocked_between', { user_a: userA, user_b: userB })
  return !!data
}
