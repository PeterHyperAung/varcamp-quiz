import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

import type {
  AttemptStatus,
  PublicationStatus,
  QuestionType,
  QuizVersionStatus,
} from "@/lib/domain/enums";

/** `timestamptz` that may be written as a Date or an ISO string. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * `timestamptz` with a database default, so inserts may omit it.
 *
 * Written as a direct `ColumnType` rather than `Generated<Timestamp>`:
 * `Generated<T>` would leave the *select* type as `Timestamp`, not `Date`.
 */
export type DefaultTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/* -------------------------------------------------------------------------- */
/*                                 Enumerations                                */
/* -------------------------------------------------------------------------- */

/*
 * The string unions live in `lib/domain/enums` so domain modules can use them
 * without importing this Kysely-flavoured module. Re-exported here for
 * convenience at infrastructure call sites.
 */
export type {
  AttemptStatus,
  PublicationStatus,
  QuestionType,
  QuizVersionStatus,
} from "@/lib/domain/enums";

/* -------------------------------------------------------------------------- */
/*                                   Tables                                    */
/* -------------------------------------------------------------------------- */

export interface AdministratorsTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface QuizzesTable {
  id: Generated<string>;
  public_id: string;
  title: string;
  description: string | null;
  publication_status: PublicationStatus;
  /** Points at the draft version being authored, or the published version. */
  editable_version_id: string | null;
  /** Points at the currently published immutable version, if any. */
  published_version_id: string | null;
  created_by: string;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface QuizVersionsTable {
  id: Generated<string>;
  quiz_id: string;
  version: number;
  status: QuizVersionStatus;
  instructions: string | null;
  /** Percentage 0-100 required to be certificate-eligible. Null = everyone. */
  passing_score: number | null;
  certificate_enabled: Generated<boolean>;
  certificate_template_version: Generated<string>;
  published_at: Timestamp | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface QuestionsTable {
  id: Generated<string>;
  quiz_version_id: string;
  position: number;
  prompt: string;
  question_type: QuestionType;
  points: Generated<number>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface AnswerOptionsTable {
  id: Generated<string>;
  question_id: string;
  position: number;
  label: string;
  is_correct: Generated<boolean>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface QuizAttemptsTable {
  id: Generated<string>;
  public_id: string;
  quiz_id: string;
  /** The exact immutable published version this attempt was scored against. */
  quiz_version_id: string;
  status: AttemptStatus;
  participant_name: string | null;
  score: Generated<number | null>;
  max_score: Generated<number | null>;
  percentage: Generated<number | null>;
  passed: Generated<boolean | null>;
  started_at: DefaultTimestamp;
  submitted_at: Timestamp | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface AttemptAnswersTable {
  id: Generated<string>;
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: Generated<boolean>;
  points_awarded: Generated<number>;
  created_at: DefaultTimestamp;
}

export interface CertificatesTable {
  id: Generated<string>;
  public_id: string;
  attempt_id: string;
  quiz_id: string;
  quiz_version_id: string;
  /** Snapshotted so the certificate never changes if the quiz is renamed. */
  participant_name: string;
  quiz_title: string;
  score: number;
  max_score: number;
  percentage: number;
  template_version: string;
  issued_at: DefaultTimestamp;
  revoked_at: Timestamp | null;
  created_at: DefaultTimestamp;
}

export interface EventsTable {
  id: Generated<string>;
  public_id: string;
  /** Optional room assignment; removing a room leaves the event intact. */
  room_id: Generated<string | null>;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: Timestamp;
  ends_at: Timestamp;
  timezone: string;
  publication_status: PublicationStatus;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface RoomsTable {
  id: Generated<string>;
  public_id: string;
  name: string;
  description: string | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface LoginThrottlesTable {
  key: string;
  failures: number;
  window_start: DefaultTimestamp;
  blocked_until: Timestamp | null;
  updated_at: DefaultTimestamp;
}

export interface Database {
  administrators: AdministratorsTable;
  quizzes: QuizzesTable;
  quiz_versions: QuizVersionsTable;
  questions: QuestionsTable;
  answer_options: AnswerOptionsTable;
  quiz_attempts: QuizAttemptsTable;
  attempt_answers: AttemptAnswersTable;
  certificates: CertificatesTable;
  events: EventsTable;
  rooms: RoomsTable;
  login_throttles: LoginThrottlesTable;
}

/* -------------------------------------------------------------------------- */
/*                              Row helper types                              */
/* -------------------------------------------------------------------------- */

export type AdministratorRow = Selectable<AdministratorsTable>;
export type QuizRow = Selectable<QuizzesTable>;
export type QuizVersionRow = Selectable<QuizVersionsTable>;
export type QuestionRow = Selectable<QuestionsTable>;
export type AnswerOptionRow = Selectable<AnswerOptionsTable>;
export type QuizAttemptRow = Selectable<QuizAttemptsTable>;
export type AttemptAnswerRow = Selectable<AttemptAnswersTable>;
export type CertificateRow = Selectable<CertificatesTable>;
export type EventRow = Selectable<EventsTable>;
export type RoomRow = Selectable<RoomsTable>;

export type NewQuiz = Insertable<QuizzesTable>;
export type NewQuizVersion = Insertable<QuizVersionsTable>;
export type NewQuestion = Insertable<QuestionsTable>;
export type NewAnswerOption = Insertable<AnswerOptionsTable>;
export type NewQuizAttempt = Insertable<QuizAttemptsTable>;
export type NewAttemptAnswer = Insertable<AttemptAnswersTable>;
export type NewCertificate = Insertable<CertificatesTable>;
export type NewEvent = Insertable<EventsTable>;
export type NewRoom = Insertable<RoomsTable>;
export type NewAdministrator = Insertable<AdministratorsTable>;

export type QuizUpdate = Updateable<QuizzesTable>;
export type QuizVersionUpdate = Updateable<QuizVersionsTable>;
export type QuestionUpdate = Updateable<QuestionsTable>;
export type AnswerOptionUpdate = Updateable<AnswerOptionsTable>;
export type QuizAttemptUpdate = Updateable<QuizAttemptsTable>;
export type EventUpdate = Updateable<EventsTable>;
export type RoomUpdate = Updateable<RoomsTable>;
