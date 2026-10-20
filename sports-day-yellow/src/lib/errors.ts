export type ErrorCode =
  | 'OVER_TARGET'
  | 'ALREADY_REGISTERED'
  | 'NOT_REGISTERED'
  | 'DUPLICATE_NAME'
  | 'SPORT_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_INACTIVE'
  | 'SPORT_INACTIVE'
  | 'INVALID_INPUT'
  | 'SAME_SPORT'
  | 'NOT_AUTHENTICATED'
  | 'NETWORK'
  | 'UNKNOWN';

const MESSAGES: Record<ErrorCode, string> = {
  OVER_TARGET: 'จำนวนผู้สมัครจะเกินเป้าหมายของกีฬานี้ กรุณายืนยันก่อนบันทึก',
  ALREADY_REGISTERED: 'สมาชิกคนนี้สมัครกีฬาประเภทนี้อยู่แล้ว (ไม่สามารถลงซ้ำได้)',
  NOT_REGISTERED: 'ไม่พบรายการสมัครนี้ หรือถูกยกเลิกไปแล้ว — ข้อมูลอาจถูกแก้ไขจากเครื่องอื่น',
  DUPLICATE_NAME: 'มีชื่อนี้อยู่ในระบบแล้ว',
  SPORT_NOT_FOUND: 'ไม่พบประเภทกีฬานี้ หรือถูกปิดใช้งานแล้ว',
  MEMBER_NOT_FOUND: 'ไม่พบสมาชิกคนนี้',
  MEMBER_INACTIVE: 'สมาชิกคนนี้ถูกปิดใช้งานอยู่',
  SPORT_INACTIVE: 'กีฬาประเภทนี้ถูกปิดใช้งานอยู่',
  INVALID_INPUT: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  SAME_SPORT: 'กีฬาต้นทางและปลายทางต้องไม่ใช่ประเภทเดียวกัน',
  NOT_AUTHENTICATED: 'กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล',
  NETWORK: 'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  UNKNOWN: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง',
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'AppError';
  }
}

/** Converts any thrown value (incl. Supabase/Postgres errors that carry our codes) into a Thai message. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const raw = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || '';
  const code = (Object.keys(MESSAGES) as ErrorCode[]).find((c) => raw.includes(c));
  if (code) return new AppError(code);
  if (/fetch|network|Failed to fetch|timeout/i.test(raw)) return new AppError('NETWORK');
  if (/JWT|permission denied|not authenticated/i.test(raw)) return new AppError('NOT_AUTHENTICATED');
  if (/duplicate key|unique/i.test(raw)) return new AppError('ALREADY_REGISTERED');
  return new AppError('UNKNOWN', raw ? `เกิดข้อผิดพลาด: ${raw}` : undefined);
}
