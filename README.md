## 고퀄리티 매거진 생성 (운영 콘솔)

이전에는 `AI 초안 만들기`가 글만 작성했고 `6장 생성·업로드`가 단순 그라데이션 캔버스만 생성했습니다. 새 **고퀄리티 매거진 6장 만들기**는 별도 시스템입니다.

- 로그인된 관리자가 검수 전 `draft` 게시물을 선택하고 **고퀄리티 매거진 6장 만들기** 클릭
- API 호출 비용이 있다는 확인을 거친 뒤 GPT Image API로 **서로 다른 사진 3장** 생성
- 고정 템플릿의 글씨 대신 **사진/본문 배치가 서로 다른 6개 레이아웃**에 한글을 별도 렌더링해 OCR 오류를 줄임
- 1080×1350 JPEG 여섯 장을 Supabase Storage에 올린 후 원본 게시물 `image_urls`를 교체
- AI 이미지 표시 `ai_generated=true`, 검수 `verified=false`로 재설정. **Instagram 자동 게시 없음**
- 정상 완성되면 운영 콘솔 이미지 미리보기에 최종 게시용 JPEG가 표시됨
- API 모델 기본값 `gpt-image-2.5-flare`, 기본 `medium`; `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`로 변경 가능
- 생성 비용은 프로젝트에 연결된 OpenAI API 계정에 **별도 과금**됩니다. 실험 전 API 예산을 설정하세요.
- `AUTO_GENERATION_ENABLED`, `AUTO_PUBLISH_ENABLED`, `LIVE_PUBLISH_ENABLED`는 여전히 별개로 제어됨

매일 자동화는 `AUTO_PHOTO_ENABLED=true`일 때 이 프리미엄 렌더러로 생성하도록 연결했습니다. **자동 게시를 켜기 전에 반드시 실제 JPEG 6장과 첫 Instagram 발행을 검증하세요.**

# YOGO Social Studio

입는감각(@ipneun_gamgak)과 YOGO EDIT(@yogo.edit)의 6장 카드뉴스 편집·검수·예약·게시 시스템.

## 매일 AI 자동 제작·예약 게시 (2026-11)

YOGO Social Studio 운영판에 `api/daily-fashion.js`, `api/daily-yogo.js` 자동 생성 작업이 추가되었습니다.

- 오전 9시 KST: 입는감각 6장 에디토리얼 자동 생성
- 오전 10시 KST: YOGO EDIT 6장 구매 체크리스트 자동 생성
- 한국시간 낮 12시 / 저녁 8시: 기존 `api/cron.js` 예약 게시 검사
- 동일 날짜/계정은 DB 고유 인덱스로 중복 생성 방지, 게시 실패 시 자동 재시도 금지
- AI가 에버그린 정보성 원고를 작성하고, Satori + Sharp가 1080×1350 JPEG 6장을 제작해 별도 Supabase Storage에 저장
- 사진 없이도 한국어 타이포그래피 기반 에디토리얼 JPEG 6장을 제작합니다. 별도로 유료 이미지 API를 활성화하면 계정별로 브랜드 없는 AI 에디토리얼 화보 1장을 생성해 표지에 합성합니다.

### 필요한 환경변수

| Key | 현재 권장 값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | **미등록 — 직접 Sensitive 등록** | AI 원고 제작용 별도 API 유료 사용 |
| `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` | 원고 생성 모델 기본값 |
| `AUTO_PHOTO_ENABLED` | `false` (초기) | 유료 AI 패션·쇼핑 에디토리얼 사진 자동 생성 토글 |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | 자동 화보 모델 선택, 추가 과금 |
| `AUTO_GENERATION_ENABLED` | `false` (초기) | 검증 후 `true`로 전환 |
| `AUTO_PUBLISH_ENABLED` | `false` (초기) | 검증 후 `true`로 전환 |
| `LIVE_PUBLISH_ENABLED` | `false` (초기) | 게시 테스트 성공 후 `true`로 전환 |

**서버에서 세 가지 스위치를 켜기 전까지 신규 생성 작업과 자동 게시는 시작되지 않습니다.**
AI 키 등록 후 운영 콘솔의 **오늘의 6장 자동 생성 테스트**로 먼저 두 계정 결과를 시험하세요.
완료된 이미지의 문자 가독성/사실관계, 6개 HTTPS JPEG URL, Meta 실제 계정 게시 성공을 반드시 확인한 후 활성화하세요.
자동 게시 ON에서는 자동 규칙으로 검사된 정보성 게시물을 인간의 사전 검수 없이 전송하므로, 최초 테스트와 지속적 품질 모니터링이 중요합니다.
Vercel Hobby 플랜의 cron 실행 시각은 해당 시각부터 1시간 이내로 늦어질 수 있어 정확한 정각 게시를 보장하지 않습니다.
별도 비용 발생 가능: OpenAI API 유료 호출, Vercel 실행시간·Supabase 사용량.

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