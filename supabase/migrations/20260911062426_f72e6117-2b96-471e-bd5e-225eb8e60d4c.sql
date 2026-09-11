-- Anonymous, browser-scoped learner identity (no accounts, no auth).
ALTER TABLE public.attempts ADD COLUMN learner_id text NOT NULL DEFAULT 'legacy-unowned';
ALTER TABLE public.attempts ALTER COLUMN learner_id DROP DEFAULT;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_learner_id_len CHECK (char_length(learner_id) BETWEEN 8 AND 64);
CREATE INDEX attempts_learner_problem_idx ON public.attempts (learner_id, problem_id);
ALTER TABLE public.attempts
  ADD CONSTRAINT attempts_unique_number_per_learner_problem UNIQUE (learner_id, problem_id, attempt_number);

-- The learner id travels as a request header; PostgREST exposes it to policies.
CREATE OR REPLACE FUNCTION public.current_learner_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(
    coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-learner-id',
      ''
    ),
    ''
  )
$$;

DROP POLICY IF EXISTS attempts_read ON public.attempts;
DROP POLICY IF EXISTS attempts_insert ON public.attempts;
DROP POLICY IF EXISTS attempts_update ON public.attempts;

CREATE POLICY attempts_owner_read ON public.attempts FOR SELECT TO anon, authenticated
  USING (learner_id = public.current_learner_id());
CREATE POLICY attempts_owner_insert ON public.attempts FOR INSERT TO anon, authenticated
  WITH CHECK (learner_id = public.current_learner_id());
CREATE POLICY attempts_owner_update ON public.attempts FOR UPDATE TO anon, authenticated
  USING (learner_id = public.current_learner_id())
  WITH CHECK (learner_id = public.current_learner_id());

DROP POLICY IF EXISTS submissions_read ON public.submissions;
DROP POLICY IF EXISTS submissions_insert ON public.submissions;
DROP POLICY IF EXISTS submissions_update ON public.submissions;

CREATE POLICY submissions_owner_read ON public.submissions FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = submissions.attempt_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY submissions_owner_insert ON public.submissions FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = submissions.attempt_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY submissions_owner_update ON public.submissions FOR UPDATE TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = submissions.attempt_id AND a.learner_id = public.current_learner_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = submissions.attempt_id AND a.learner_id = public.current_learner_id()));

DROP POLICY IF EXISTS evaluations_read ON public.evaluations;
DROP POLICY IF EXISTS evaluations_insert ON public.evaluations;
DROP POLICY IF EXISTS evaluations_update ON public.evaluations;

CREATE POLICY evaluations_owner_read ON public.evaluations FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.attempts a ON a.id = s.attempt_id
    WHERE s.id = evaluations.submission_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY evaluations_owner_insert ON public.evaluations FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.attempts a ON a.id = s.attempt_id
    WHERE s.id = evaluations.submission_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY evaluations_owner_update ON public.evaluations FOR UPDATE TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.attempts a ON a.id = s.attempt_id
    WHERE s.id = evaluations.submission_id AND a.learner_id = public.current_learner_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.attempts a ON a.id = s.attempt_id
    WHERE s.id = evaluations.submission_id AND a.learner_id = public.current_learner_id()));

DROP POLICY IF EXISTS feedback_read ON public.feedback;
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
DROP POLICY IF EXISTS feedback_update ON public.feedback;

CREATE POLICY feedback_owner_read ON public.feedback FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations e JOIN public.submissions s ON s.id = e.submission_id
    JOIN public.attempts a ON a.id = s.attempt_id
    WHERE e.id = feedback.evaluation_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY feedback_owner_insert ON public.feedback FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.evaluations e JOIN public.submissions s ON s.id = e.submission_id
    JOIN public.attempts a ON a.id = s.attempt_id
    WHERE e.id = feedback.evaluation_id AND a.learner_id = public.current_learner_id()));
CREATE POLICY feedback_owner_update ON public.feedback FOR UPDATE TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations e JOIN public.submissions s ON s.id = e.submission_id
    JOIN public.attempts a ON a.id = s.attempt_id
    WHERE e.id = feedback.evaluation_id AND a.learner_id = public.current_learner_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.evaluations e JOIN public.submissions s ON s.id = e.submission_id
    JOIN public.attempts a ON a.id = s.attempt_id
    WHERE e.id = feedback.evaluation_id AND a.learner_id = public.current_learner_id()));
