# Qbot: 교육용 AI 챗봇 설계 및 평가 플랫폼

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.io/) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

## 📌 프로젝트 개요

**목표:** 교사가 직접 AI 챗봇(Qbot)을 설계하고 학생에게 배포하여, 학생과의 상호작용을 통해 학습 목표 도달 여부를 확인하고 평가할 수 있는 교육용 챗봇 플랫폼을 구축합니다.

**주요 사용자:**
*   **교사:** 챗봇 설계, 학생/클래스 관리, 참고 자료 관리, 챗봇 배포 및 운영, 학습 결과 대시보드 확인.
*   **학생:** 챗봇과 대화하며 학습 수행, 참고 자료 열람, 학습 목표 자가 평가.

---

## ✨ 주요 기능 (구현 완료)

*   **교사용:**
    *   챗봇 관리 (생성, 수정, 삭제)
    *   챗봇 설정 (이름, 프롬프트, 학습 목표, 허용 클래스, 사용 횟수 제한 등)
    *   참고 자료 관리 (PDF/텍스트 업로드, 목록 조회, 삭제, 학생 공개 설정)
    *   학생 관리 (CSV 일괄 등록, 목록 조회)
    *   클래스 관리 (기본 UI)
    *   대화 기록 조회 (세션 목록 및 상세 메시지)
    *   대시보드 (KPI, 챗봇별 통계, 목표별 통계 시각화 - recharts 사용)
    *   AI 시나리오 생성 제안
    *   AI 학습 목표 평가 실행 (결과 표시 확인)
*   **학생용:**
    *   학번/비밀번호 로그인
    *   챗봇 선택 및 대화 인터페이스 (스트리밍 응답, 이미지 첨부, STT)
    *   참고 자료 열람 (교사가 공개 설정한 자료)
    *   학습 목표 자가 체크 및 AI 평가 결과 확인
    *   사용 횟수 제한 적용

---

## 🛠️ 기술 스택

*   **프레임워크:** Next.js (App Router)
*   **데이터베이스/인증/스토리지:** Supabase (PostgreSQL, Auth, Storage)
*   **UI:** Tailwind CSS, shadcn/ui
*   **차트:** Recharts
*   **파일 파싱:** PapaParse (CSV)
*   **상태 관리:** React Hooks (useState, useEffect, useCallback, useMemo)
*   **테스팅:** Jest
*   **AI:** OpenAI API (호출 부분 확인 필요), 기타 (구현 예정)

---

## 🚀 시작하기 (Getting Started)

1.  **저장소 복제:**
    ```bash
    git clone <repository-url>
    cd qbot-project-directory
    ```

2.  **의존성 설치:**
    ```bash
    npm install
    # 또는
    yarn install
    ```

3.  **환경 변수 설정:**
    *   프로젝트 루트에 `.env.local` 파일을 생성합니다.
    *   Supabase 프로젝트에서 필요한 키들을 복사하여 아래 형식으로 입력합니다:
        ```plaintext
        # Supabase
        NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
        NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
        SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY # 백엔드 전용 (주의해서 사용)

        # JWT Secret (학생 로그인 토큰용 - 필요 시)
        # JWT_SECRET=YOUR_STRONG_JWT_SECRET

        # OpenAI API Key (AI 기능용 - 필요 시)
        # OPENAI_API_KEY=YOUR_OPENAI_API_KEY
        ```
    *   **주의:** `SUPABASE_SERVICE_ROLE_KEY`는 민감한 정보이므로 안전하게 관리해야 합니다.

4.  **(선택) Supabase 데이터베이스 설정:**
    *   Supabase 프로젝트에 필요한 테이블(`chatbot_templates`, `students`, `chat_messages` 등 PRD 참고)이 생성되어 있어야 합니다.
    *   필요한 경우, `supabase/migrations` 폴더의 마이그레이션 파일을 적용하여 스키마를 설정할 수 있습니다. (마이그레이션 파일 확인 필요)

5.  **개발 서버 실행:**
    ```bash
    npm run dev
    # 또는
    yarn dev
    ```

6.  **애플리케이션 접속:**
    브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.

---

## 🧪 테스팅

Jest를 사용하여 단위/통합 테스트를 실행할 수 있습니다.

```bash
# 모든 테스트 실행
npm test

# 특정 테스트 파일 실행
npm test <path/to/test/file>
```

---

*(이 문서는 지속적으로 업데이트될 수 있습니다.)*
