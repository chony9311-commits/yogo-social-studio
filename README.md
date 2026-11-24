# YOGO Social Studio

입는감각(@ipneun_gamgak)과 YOGO EDIT(@yogo.edit)의 6장 카드뉴스 편집·검수·예약·게시 시스템.

## 운영 URL

- 데모: https://yogo-social-studio.vercel.app/
- 실제 운영 콘솔: https://yogo-social-studio.vercel.app/manage.html
- Meta 앱: 1166637722530501
- **게시 기본값은 OFF**. 관리자 인증과 토큰 검증·테스트가 완료되기 전 인스타그램으로 발행되지 않습니다.

## 구현 상태

- ✅ GitHub/Vercel 프로덕션 배포, 공개 데모 UI, 6장 초안 편집 및 PNG 내려받기
- ✅ 서버측 관리자 권한 검사(Supabase Auth), PostgREST RLS CRUD, 서버 저장소 JPEG 업로드 코드
- ✅ 운영 콘솔(로그인·초안·AI 원고 생성 옵션·검수·예약·이미지 업로드 UI)
- ✅ 안전한 예약 발행 Cron 코드, Meta Graph API v27.0 JPEG carousel 출판, 원자적 상태 클레임, 중복 자동재시도 방지
- ⏳ 별도 Supabase 프로젝트 생성, RLS 스키마 실제 적용, 첫 관리자 계정 지정/로그인 실증
- ⏳ 비밀 환경변수 2개 계정 등록 및 Meta 게시 권한의 실제 통합 테스트
- ⏳ 사진 중심 배경 이미지/상품 진위 확인/정확한 YOGO 카탈로그 동기화
- ⏳ 승인된 실게시 활성화와 모니터링 검증

## Vercel Environment Variables (server-side)

These are NAMES ONLY. Never commit real secrets to GitHub.

| Key | Required | Notes |
| --- | --- | --- |
| SUPABASE_URL | yes | Dedicated Supabase URL |
| SUPABASE_PUBLISHABLE_KEY | yes | Public publishable key |
| SUPABASE_SECRET_KEY | yes | Server secret (or legacy SUPABASE_SERVICE_ROLE_KEY) |
| STUDIO_OWNER_ID | yes | Authorized admin's UUID, from Supabase Auth |
| CRON_SECRET | yes | Strong random secret required by Vercel cron requests |
| INSTAGRAM_YOGO_ID | yes | 17841433102085872 |
| INSTAGRAM_YOGO_TOKEN | yes | Secret, must never be committed |
| INSTAGRAM_FASHION_ID | yes | 17841462970072030 |
| INSTAGRAM_FASHION_TOKEN | yes | Secret, must never be committed |
| META_GRAPH_VERSION | optional | v27.0 default |
| OPENAI_API_KEY | optional | Only for AI text draft generation; paid API usage |
| OPENAI_TEXT_MODEL | optional | gpt-4.1-mini default |
| LIVE_PUBLISH_ENABLED | yes | Set **false** until manual tests and review are complete |

**Never put secret keys or Instagram tokens into variables starting with NEXT_PUBLIC_.** Set production variables on the specific Vercel project \`yogo-social-studio\`, *not* on the existing \`yogo\` storefront.

## Dedicated Supabase setup

1. Create a separate project (not production YOGO/NEWSIQ/jaegaebal114), preferably Seoul region.
2. Run \`supabase/schema.sql\` in that project's SQL editor. It creates \`studio_posts\`, \`studio_publish_log\` with row-level security, and public-read / restricted-upload JPEG bucket \`studio-media\`.
3. Create an administrator email/password user, verify email, and copy only their **Auth UUID** into \`STUDIO_OWNER_ID\`.
4. Set Vercel production environment variables, then redeploy.
5. Visit \`/manage.html\`, sign in, create an example draft, save all six JPEG images, check details, approve and schedule.
6. Confirm the database reflects the post and the image URLs work without authentication; Meta will fetch publicly accessible JPEGs.

## Posting safety

- \`LIVE_PUBLISH_ENABLED\` defaults to disabled. Server cron returns a safe no-op until enabled.
- On Hobby, Vercel cron may run within its hour, **not necessarily precisely at 12:00 / 20:00**.
- YOGO must have a real HTTPS landing URL and must not claim unverified product prices, discounts, celebrities' endorsements, or scarcity.
- A post must be explicitly marked verified, include six reachable public JPEG URLs, and be approved before scheduling.
- Commission-based posts must include a clear disclosure such as \`광고·제휴\` and the appropriate required wording.
- Failed/uncertain publication attempts are logged and cannot silently republish.

## Known limitations

- The current browser-created JPEGs are typographic placeholder images, not final editorial fashion photographs or genuine product photos. Use the public demo to explore layout only. Replace with licensed or owned photography before publishing.
- Storage, AI, and Instagram token integration have not been live-tested without your project's secrets.
- Public demo stores browser-local draft data. The authenticated operations console uses Supabase instead.
- Unified Login token and its exact Graph permissions must be verified via authenticated calls before enabling live publishing.
- The GitHub repository is presently public: code is visible, **secrets must remain out of the repository**.

## Repository

- \`index.html\`: public demo (local-only).
- \`manage.html\`: administrator operations UI (server validates owner token).
- \`api/studio.js\`: Supabase Auth, owner-scoped CRUD, AI drafts, secure JPEG storage.
- \`api/cron.js\`: authenticated, opt-in Meta carousel publication.
- \`supabase/schema.sql\`: database and RLS definitions.
- \`vercel.json\`: Korean publishing windows: UTC 03:00 and 11:00.

## Cost caution

AI text generation may incur API charges, and Vercel/Supabase resource plan limits apply. Content moderation and final human approvals remain necessary.