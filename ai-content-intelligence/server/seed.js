// Demo data. Everything here is FICTIONAL, flagged isMock:true, has no real links,
// and is labelled "[ข้อมูลจำลอง]" so it can never be mistaken for real news or real metrics.
import { newId, now } from './db.js';

const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();

export function buildMock() {
  const base = { url: null, source: 'ข้อมูลจำลอง', feedId: 'mock', feedCredibility: 'low', kind: 'news', feedType: 'news', relatedSources: [], trafficHint: null, eventAt: null, isMock: true, status: 'new', verificationBy: 'auto' };
  const items = [
    { title: '[ข้อมูลจำลอง] ตัวอย่างข่าวเตือนฝนตกหนักในจังหวัดสมมุติ', summary: 'ตัวอย่างสรุปข่าวสำหรับทดลองระบบเท่านั้น ไม่ใช่เหตุการณ์จริง', publishedAt: hoursAgo(2) },
    { title: '[ข้อมูลจำลอง] ตัวอย่างแอปใหม่เปิดตัวฟีเจอร์ AI', summary: 'ตัวอย่างสรุปข่าวเทคโนโลยีสมมุติ', publishedAt: hoursAgo(5) },
    { title: '[ข้อมูลจำลอง] ตัวอย่างราคาน้ำมันปรับขึ้นในประเทศสมมุติ', summary: 'ตัวอย่างข่าวเศรษฐกิจสมมุติ ตัวเลขทั้งหมดไม่จริง', publishedAt: hoursAgo(9) },
    { title: '[ข้อมูลจำลอง] คอลัมน์ความเห็น: ตัวอย่างบทความมุมมองเรื่องการศึกษา', summary: 'ตัวอย่างบทความความคิดเห็นสมมุติ', publishedAt: hoursAgo(20) },
    { title: '[ข้อมูลจำลอง] ลือว่อนโซเชียล ตัวอย่างข่าวที่ยังไม่ยืนยัน', summary: 'ตัวอย่างประเด็นที่ยังไม่มีการยืนยัน', publishedAt: hoursAgo(1) },
  ].map((x) => ({ ...base, ...x, id: newId('i'), discoveredAt: now() }));

  const platforms = ['tiktok', 'reels', 'facebook', 'shorts'];
  const posts = [];
  for (let i = 0; i < 10; i++) {
    posts.push({
      id: newId('p'), contentId: null, isMock: true, source: 'mock',
      title: `[ข้อมูลจำลอง] โพสต์ตัวอย่าง #${i + 1}`,
      platform: platforms[i % 4],
      postedAt: hoursAgo(24 * (10 - i)),
      // deterministic pseudo numbers — demo only
      views: 1000 + ((i * 7919) % 9000),
      avgWatchPct: 20 + ((i * 37) % 45),
      shares: 5 + ((i * 13) % 80),
      comments: 3 + ((i * 17) % 60),
      likes: 40 + ((i * 101) % 500),
    });
  }
  return { items, posts };
}
