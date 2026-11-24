# YOGO Social Studio

입는감각(@ipneun_gamgak) + YOGO EDIT(@yogo.edit)의 카드뉴스 제작/검수/예약 운영 화면.

## 배포 상태

이 저장소는 **데모 프런트엔드**입니다. 두 계정의 6장 카드뉴스 초안을 편집하고 미리보기·PNG 내보내기·검수 상태 관리를 할 수 있습니다. 저장 내용은 현재 사용자 브라우저의 localStorage에만 존재합니다. 예약과 발행은 **시뮬레이션**이며 실제 인스타그램에 업로드하지 않습니다.

- Meta 앱 ID: 1166637722530501
- Instagram 계정 ID (YOGO): 17841433102085872
- Instagram 계정 ID (Fashion): 17841462970072030
- **Meta 토큰, Supabase 비밀키, OpenAI 키를 저장소에 올리지 마세요.**
- Vercel 비밀 환경변수와 Supabase Auth/DB, Meta 전송 서버를 연결하고 검증하기 전에는 실제 게시 활성화 금지.

## 추후 연결

이전 단계에서 만든 전체 MVP 파일 `yogo_social_studio_mvp.zip`에는 Supabase·Meta·AI·Vercel Cron 연동 스캐폴드가 있습니다. 현재 이 저장소에는 우선 검수용 웹 화면만 배포합니다. 차후 서버 기능을 추가하고 자체 계정 테스트를 통과한 뒤 실게시합니다.

## 개발

모든 UI는 루트 `index.html`에서 실행됩니다. `/api/status`는 서버 비밀키의 존재 유무만 반환하며 비밀 문자열은 반환하지 않습니다.

앱에서 편집한 내용은 브라우저에만 저장되므로 다른 PC와 동기화되지 않습니다.
