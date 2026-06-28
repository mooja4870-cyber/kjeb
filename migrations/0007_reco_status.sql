-- [관리자 승인] 사용자 제보에 승인 상태 추가 (pending=미승인/기본, approved=노출)
ALTER TABLE user_recos ADD COLUMN status TEXT DEFAULT 'pending';
