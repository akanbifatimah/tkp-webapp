import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AssessmentInput, AttendanceInput, CourseInput, ReviewInput, SessionInput, Upload } from "./grow-types";

/** TanStack Query hooks for Grow (docs/API.md §13). */

export const growKeys = {
  all: ["learn"] as const,
  overview: ["learn", "overview"] as const,
  courses: ["learn", "courses"] as const,
  course: (id: string) => ["learn", "course", id] as const,
  roster: (id: string) => ["learn", "roster", id] as const,
  people: (id: string, q: string) => ["learn", "people", id, q] as const,
  session: (id: string) => ["learn", "session", id] as const,
  attendance: (id: string) => ["learn", "attendance", id] as const,
  assessment: (id: string) => ["learn", "assessment", id] as const,
  submissions: (id: string) => ["learn", "submissions", id] as const,
  submission: (id: string) => ["learn", "submission", id] as const,
};

export const useSubmissions = (assessmentId: string) => useQuery({ queryKey: growKeys.submissions(assessmentId), queryFn: ({ signal }) => api.learn.submissions(assessmentId, signal) });
export const useSubmission = (id: string) => useQuery({ queryKey: growKeys.submission(id), queryFn: ({ signal }) => api.learn.submission(id, signal) });

export const useSessionDetail = (id: string) => useQuery({ queryKey: growKeys.session(id), queryFn: ({ signal }) => api.learn.session(id, signal) });
export const useAttendance = (id: string) => useQuery({ queryKey: growKeys.attendance(id), queryFn: ({ signal }) => api.learn.attendance(id, signal) });
export const useAssessment = (id: string | undefined) =>
  useQuery({ queryKey: growKeys.assessment(id ?? ""), queryFn: ({ signal }) => api.learn.assessment(id!, signal), enabled: !!id });

export const useGrowOverview = () => useQuery({ queryKey: growKeys.overview, queryFn: ({ signal }) => api.learn.overview(signal) });
export const useCourses = () => useQuery({ queryKey: growKeys.courses, queryFn: ({ signal }) => api.learn.courses(signal) });
export const useCourse = (id: string | undefined) =>
  useQuery({ queryKey: growKeys.course(id ?? ""), queryFn: ({ signal }) => api.learn.course(id!, signal), enabled: !!id });
export const useRoster = (id: string, enabled = true) => useQuery({ queryKey: growKeys.roster(id), queryFn: ({ signal }) => api.learn.roster(id, signal), enabled });
export const usePeopleSearch = (courseId: string, q: string) =>
  useQuery({
    queryKey: growKeys.people(courseId, q),
    queryFn: ({ signal }) => api.learn.people(courseId, q, signal),
    enabled: q.trim().length >= 2,
    placeholderData: (prev) => prev,
  });

/** Every Grow write can change counts on the dashboard, the list and the class; done once the fresh data is in. */
const refresh = async (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
  await qc.invalidateQueries({ queryKey: growKeys.all });
};

function useGrowMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => refresh(qc) });
}

export const useCreateCourse = () => useGrowMutation((v: CourseInput) => api.learn.create(v));
export const useUpdateCourse = () => useGrowMutation((v: { id: string; body: CourseInput & { rowVer: number } }) => api.learn.update(v.id, v.body));
export const usePublishCourse = () => useGrowMutation((v: { id: string; rowVer: number }) => api.learn.publish(v.id, v.rowVer));
export const useRegistration = () => useGrowMutation((v: { id: string; open: boolean; rowVer: number }) => api.learn.registration(v.id, v.open, v.rowVer));
export const useArchiveCourse = () => useGrowMutation((v: { id: string; rowVer: number }) => api.learn.archive(v.id, v.rowVer));
export const useDeleteCourse = () => useGrowMutation((id: string) => api.learn.remove(id));

export const useCreateSession = () => useGrowMutation((v: { courseId: string; body: Partial<SessionInput> }) => api.learn.createSession(v.courseId, v.body));
export const useUpdateSession = () =>
  useGrowMutation((v: { id: string; body: SessionInput & { rowVer: number; applyTo?: "new" | "everyone" } }) => api.learn.updateSession(v.id, v.body));
export const usePublishSession = () => useGrowMutation((v: { id: string; rowVer: number; publish: boolean }) => api.learn.publishSession(v.id, v.rowVer, v.publish));
export const useDeleteSession = () => useGrowMutation((id: string) => api.learn.deleteSession(id));

export const useUpload = () => useMutation({ mutationFn: (v: { purpose: "video" | "handout" | "resource"; file: File }) => api.learn.upload(v.purpose, v.file) });
export const useAddResource = () => useGrowMutation((v: { courseId: string; file: Upload }) => api.learn.addResource(v.courseId, v.file));
export const useRemoveResource = () => useGrowMutation((v: { courseId: string; fileId: string }) => api.learn.removeResource(v.courseId, v.fileId));

export const useEnrol = () => useGrowMutation((v: { courseId: string; personId: string; waive?: string }) => api.learn.enrol(v.courseId, { personId: v.personId, waive: v.waive }));
export const useWithdraw = () => useGrowMutation((v: { id: string; reason: string }) => api.learn.withdraw(v.id, v.reason));
export const usePromote = () => useGrowMutation((id: string) => api.learn.promote(id));

export const useSaveAttendance = () => useGrowMutation((v: { sessionId: string; body: AttendanceInput }) => api.learn.saveAttendance(v.sessionId, v.body));
export const useCreateAssessment = () => useGrowMutation((v: { courseId: string; body: AssessmentInput }) => api.learn.createAssessment(v.courseId, v.body));
export const useUpdateAssessment = () => useGrowMutation((v: { id: string; body: AssessmentInput & { rowVer: number } }) => api.learn.updateAssessment(v.id, v.body));
export const usePublishAssessment = () => useGrowMutation((v: { id: string; rowVer: number; publish: boolean }) => api.learn.publishAssessment(v.id, v.rowVer, v.publish));
export const useDeleteAssessment = () => useGrowMutation((id: string) => api.learn.deleteAssessment(id));
export const useReview = () => useGrowMutation((v: { id: string; body: ReviewInput }) => api.learn.review(v.id, v.body));
export const useRemind = () => useGrowMutation((assessmentId: string) => api.learn.remind(assessmentId));
export const useExcuse = () => useGrowMutation((v: { assessmentId: string; enrolmentId: string; reason: string | null }) => api.learn.excuse(v.assessmentId, v.enrolmentId, v.reason));
