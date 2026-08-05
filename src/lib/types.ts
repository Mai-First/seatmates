// Hand-maintained row/RPC types. If you change a migration, change these.

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  major: string | null;
  hometown: string | null;
  bio: string | null;
  study_spot: string | null;
  instagram: string | null;
  linkedin: string | null;
  photo_url: string | null;
};

export type DeckCard = {
  id: string;
  full_name: string;
  major: string | null;
  hometown: string | null;
  bio: string | null;
  study_spot: string | null;
  instagram: string | null;
  linkedin: string | null;
  photo_url: string | null;
  email: string;
  shared: SharedSection[];
  shared_count: number;
};

export type CatalogResult = {
  section_id: string;
  course_id: string;
  code: string;
  title: string;
  section: string;
  instructor: string | null;
  call_number: string | null;
  enrolled: number | null;
  capacity: number | null;
  enrolled_here: boolean;
};

export type MyCourse = {
  section_id: string;
  course_id: string;
  code: string;
  title: string;
  section: string;
  instructor: string | null;
  chat_left: boolean;
};

export type ConversationSummary = {
  id: string;
  kind: 'section' | 'dm';
  title: string;
  subtitle: string | null;
  photo_url: string | null;
  other_id: string | null;
  last_body: string | null;
  last_at: string;
  unread: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: Pick<Profile, 'id' | 'full_name' | 'photo_url'>;
};

export type Member = {
  id: string;
  full_name: string | null;
  major: string | null;
  photo_url: string | null;
  relationship: Relationship;
};

export type Relationship =
  | 'self'
  | 'friends'
  | 'out_pending'
  | 'in_pending'
  | 'none'
  | 'blocked';

export type ArchivedConversation = {
  id: string;
  title: string;
  subtitle: string | null;
  last_at: string;
};

export type InboxItem = {
  id: string;
  kind:
    | 'friend_request'
    | 'request_accepted'
    | 'new_match'
    | 'announcement'
    | 'study_rsvp'
    | 'study_update'
    | 'report';
  body: string;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_photo: string | null;
  entity_id: string | null;
  request_status: 'pending' | 'accepted' | 'declined' | null;
};

export type StudySession = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  capacity: number | null;
  course_code: string;
  course_title: string;
  host_id: string;
  host_name: string | null;
  going_count: number;
  my_status: 'going' | 'maybe' | null;
};

export type SharedSection = { code: string; section: string; title: string };
