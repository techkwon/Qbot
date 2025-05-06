import { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * 사용자가 'teacher' 역할을 가지고 있는지 확인합니다.
 * @param supabase Supabase 클라이언트 인스턴스
 * @param user 인증된 사용자 객체
 * @returns 사용자가 교사이면 true, 아니면 false 또는 오류 발생 시 null을 반환할 수 있습니다.
 *          (API 라우트에서는 오류 발생 시 적절한 HTTP 상태 코드를 반환해야 함)
 */
export async function verifyTeacherRole(supabase: SupabaseClient, user: User): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error(`Error fetching profile for user ${user.id}:`, error);
      // 프로필 조회 오류 시 false 반환 (또는 오류 throw)
      return false; 
    }

    if (!profile || profile.role !== 'teacher') {
      console.warn(`Authorization failed: User ${user.id} does not have 'teacher' role. Role: ${profile?.role}`);
      return false;
    }
    
    // 교사 역할 확인 성공
    console.log(`User ${user.id} verified as teacher.`);
    return true;

  } catch (err) {
    console.error('Unexpected error during role verification:', err);
    return false;
  }
}
