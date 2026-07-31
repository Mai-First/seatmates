import CourseManager from '../features/schedule/CourseManager';

/** Mid-semester add/drop (PLAN D18). Same component as onboarding, drop enabled. */
export default function Courses() {
  return <CourseManager showDrop />;
}
