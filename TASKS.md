# 🚀 ChatCat 개발 태스크 목록

이 문서는 [prd.txt](cci:7://file:///Users/techkwon/my-app/ChatCat/prd.txt:0:0-0:0) 문서를 기반으로 도출된 개발 태스크 목록입니다.

## 🏗️ 1. 프로젝트 초기 설정 및 코어 인프라

*   [x] Next.js 프로젝트 초기화 (TypeScript 기반)
*   [x] Tailwind CSS 설정 및 연동 (가정)
*   [x] Supabase 프로젝트 생성 (Database, Auth, Storage 설정)
*   [x] 기본 폴더 구조 정의 (components, app, api, lib/utils 등)
*   [ ] Vercel 배포 파이프라인 설정 (선택사항, 추후 진행 가능)

## ⚙️ 2. 백엔드 / API (Next.js API Routes & Supabase)

### 🔐 인증 (Authentication)
*   [x] 교사 회원가입 및 로그인 API 구현 (Supabase Auth 활용)
*   [x] 학생 로그인 API 구현 (학번, 비밀번호 기반, bcrypt 비교)
*   [x] 비밀번호 암호화 (bcrypt 사용)
*   [x] 세션 또는 토큰 기반 인증 관리 (커스텀: studentId, sessionId 전달 방식)

### 🗄️ 데이터베이스 스키마 및 CRUD API (Supabase)
*   [ ] PRD 기반 Supabase 테이블 생성 (일부 진행)
    *   [x] `chatbots`
    *   [x] `learning_goals`
    *   [x] `profiles` (사용자 역할 관리에 사용 중)
    *   [x] `student_sessions` (세션 및 사용 횟수 기록)
    *   [x] `messages`
    *   [x] `student_goal_responses`
    *   [x] `classes` (학생 정보 내 클래스명 활용 및 관련 로직)
    *   [x] `reference_files` 메타데이터 테이블
*   [x] 학생 CRUD API 구현 (교사용)
    - [x] 학생 생성 (POST /api/teacher/students)
    - [x] 전체 학생 목록 조회 (GET /api/teacher/students)
    - [x] 특정 학생 정보 조회 (GET /api/teacher/students/[studentId])
    - [x] 학생 정보 수정 (PATCH /api/teacher/students/[studentId] - 이름, 학번)
    - [x] 학생 삭제 (DELETE /api/teacher/students/[studentId])
    - [x] CSV 파일을 이용한 학생 대량 등록 (POST /api/teacher/students/bulk)
*   [x] 클래스 관리 API (교사용 UI에서 클래스 정보 관리 기능 포함)
*   [x] 챗봇 템플릿 CRUD API (설계, 프롬프트, 모델 등 관리 - 교사용)
*   [x] 학습 목표 CRUD API
*   [x] 참고 자료 관리 API (업로드/삭제 - Supabase Storage 연동, 공개 여부 설정)
*   [x] 채팅 세션 관리 API (시작, 총 사용 횟수 기록 및 검증 - `POST /api/chatbots/[chatbotId]/sessions`)
*   [x] 학습 목표 목록 조회 API (학생용 - `GET /api/chatbots/[chatbotId]/goals`)
*   [x] 학생 학습 목표 응답 저장 API (`POST /api/student-goal-responses`)

### 🤖 챗봇 관리 API
*   [x] 챗봇별 사용 가능 클래스 설정 API (`PUT /api/teacher/chatbots/[id]`)
*   [x] 챗봇별 총 사용 가능 횟수 설정 API (교사용 - `PUT /api/teacher/chatbots/[id]`)
*   [x] 챗봇별 고유/커스텀 접속 링크 생성/관리 API (`PUT /api/teacher/chatbots/[id]`)
*   [x] 학생 인터페이스용 챗봇 상세 정보 조회 API (`GET /api/chatbots/[slug]`)
*   [x] 학생 챗봇 사용 가능 여부 확인 API (활성화 상태, 총 사용 횟수 체크 - 세션 시작 API 내 포함)
*   [x] 사용 횟수 관리 API (학생별 초기화/횟수 추가, 클래스별/챗봇별 전체 초기화) - **다음 작업 후보** -> **완료**

### ✨ AI 연동 API
*   [x] 채팅 요청 처리 API (OpenAI API 연동, 대화 맥락 관리 - `/api/chat`)
*   [x] 챗봇 시나리오 생성 지원 API (교사용, OpenAI 연동 - `/api/ai/generate-scenario`)
*   [x] 학습 목표 달성 여부 평가 API (OpenAI 연동 - `/api/ai/evaluate-goals`)
*   [ ] STT 처리 API (Whisper API 사용 시) - 현재 Web Speech API 사용 중
*   [x] 이미지 분석 요청 API (Vision API 사용 시) - `/api/chat` 내 연동 확인
*   [x] 파일 서명된 URL 생성 API (학생/교사 파일 접근용 - `GET /api/files/signed-url`)
*   [ ] 챗봇 설계/편집 인터페이스
    *   기본 정보 입력 (이름, 설명 등)
    *   프롬프트 입력 영역
    *   [x] 참고 자료 업로드 컴포넌트 (파일 선택, URL 입력, 공개 여부 설정) - 완료
    *   [x] 학습 목표 정의 컴포넌트
    *   [x] 사용 허용 클래스 선택 컴포넌트 - 완료
    *   [x] 챗봇별 총 사용 가능 횟수 설정 컴포넌트 - 완료
    *   [x] 접속 링크 생성 및 커스텀 설정 영역 - 완료
*   [x] 학생 관리 페이지 (목록 조회, 개별 추가, CSV 업로드 기능)
*   [x] 클래스 관리 페이지 (생성, 학생 배정 등)
*   [x] 챗봇 목록 및 관리 페이지
*   [x] 학생 대화 기록 조회 페이지
*   [x] 학습 피드백/평가 결과 시각화 대시보드 - 기본 구현 완료 (`/teacher/dashboard`)
*   [x] 사용 횟수 초기화 인터페이스 - **다음 작업 후보** -> **완료 (횟수 추가 포함)**

### 📊 데이터 조회 API (교사용)
*   [x] 학생별 대화 기록 조회 API (`GET /api/teacher/conversations/[conversationId]/messages`)
*   [x] 학습 목표 달성 대시보드 데이터 조회 API (`GET /api/teacher/dashboard/feedback`)
*   [x] 참고 자료 조회 API (학생용 - 공개 설정 확인, `GET /api/teacher/chatbots/[chatbotId]/references`)
*   [x] 참고 자료 열람 페이지 (교사가 공개 설정한 자료만 - 학생 ChatInterface 내 모달)
*   [x] 학습 목표 체크리스트 페이지 (학생 ChatInterface 내 모달, 자가 체크 + AI 평가 결과 표시) - AI 평가 표시 추가됨 (`ConversationViewerClient`)

## 🎨 3. 프론트엔드 (Next.js & Tailwind CSS)

### 🧩 공통 컴포넌트
*   [x] 기본 레이아웃 (Navbar, Sidebar 등)
*   [ ] UI 요소 (Buttons, Inputs, Modals, Tables, Toasts 등)

### 🧑‍🏫 교사 대시보드
*   [ ] 로그인 페이지
*   [ ] 대시보드 메인 페이지
*   [ ] 챗봇 설계/편집 인터페이스
    *   기본 정보 입력 (이름, 설명 등)
    *   프롬프트 입력 영역
    *   [x] 참고 자료 업로드 컴포넌트 (파일 선택, URL 입력, 공개 여부 설정) - 완료
    *   [x] 학습 목표 정의 컴포넌트
    *   [x] 사용 허용 클래스 선택 컴포넌트 - 완료
    *   [x] 챗봇별 총 사용 가능 횟수 설정 컴포넌트 - 완료
    *   [x] 접속 링크 생성 및 커스텀 설정 영역 - 완료
*   [x] 학생 관리 페이지 (목록 조회, 개별 추가, CSV 업로드 기능)
*   [x] 클래스 관리 페이지 (생성, 학생 배정 등)
*   [x] 챗봇 목록 및 관리 페이지
*   [x] 학생 대화 기록 조회 페이지
*   [x] 학습 피드백/평가 결과 시각화 대시보드
*   [ ] 사용 횟수 초기화 인터페이스 - **다음 작업 후보**

### 👦 학생 인터페이스
*   [x] 챗봇 접속 및 로그인 페이지 (고유 링크 통해 접근 - `src/app/student/login/[chatbotSlug]/page.tsx`) - 완료
*   [x] 채팅 인터페이스 - 완료
    *   [x] 대화 내용 표시 영역 (학생 메시지, 봇 응답 구분)
    *   [x] 텍스트 입력 컴포넌트
    *   [x] 이미지 첨부 버튼 및 처리 로직
    *   [x] STT(음성 입력) 버튼 및 처리 로직 (Web Speech API 또는 연동)
    *   [x] 사용 횟수 안내 표시
*   [x] 참고 자료 열람 페이지 (교사가 공개 설정한 자료만 - 모달) - 완료
*   [x] 학습 목표 체크리스트 페이지 (대화 종료 후, 자가 체크 - 모달) - 완료

### 🧭 라우팅 및 상태 관리
*   [x] Next.js 페이지 라우팅 설정
*   [ ] 전역 상태 관리 필요시 라이브러리 도입 (Zustand, Context API 등)

## 🔌 4. AI 및 외부 서비스 연동

*   [x] OpenAI API 클라이언트 설정 및 연동
*   [x] 채팅 대화 맥락 관리 로직 구현
*   [x] 이미지 첨부 처리 및 Vision API 연동 로직 구현 - 백엔드 API 확인
*   [x] STT 기능 구현 (Web Speech API 프론트엔드 처리 또는 Whisper API 백엔드 연동) - Web Speech API 사용 확인
*   [x] 챗봇 시나리오 생성 프롬프트 엔지니어링 - 기본 구현 완료
*   [x] 학습 목표 평가 프롬프트 엔지니어링 및 로직 구현 - 기본 구현 완료
*   [x] Supabase Storage 연동 (참고 자료 저장)

## ✅ 5. 테스트 및 배포

*   [ ] 기본 단위 테스트 / 통합 테스트 코드 작성
*   [ ] Vercel 배포 설정 확인 및 배포
