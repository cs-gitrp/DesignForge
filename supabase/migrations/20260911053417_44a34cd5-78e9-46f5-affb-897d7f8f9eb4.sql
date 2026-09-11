CREATE TABLE public.problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy','Easy/Medium','Medium','Hard')),
  requirements TEXT[] NOT NULL DEFAULT '{}',
  think_about TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  problem_id UUID NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','EVALUATING','COMPLETED','FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);
CREATE INDEX attempts_problem_id_idx ON public.attempts(problem_id);

CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL UNIQUE REFERENCES public.attempts(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL DEFAULT 'STRUCTURED_TEXT' CHECK (submission_type IN ('STRUCTURED_TEXT')),
  assumptions TEXT NOT NULL DEFAULT '',
  classes_responsibilities TEXT NOT NULL DEFAULT '',
  relationships TEXT NOT NULL DEFAULT '',
  design_decisions TEXT NOT NULL DEFAULT '',
  edge_cases TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  evaluator_type TEXT NOT NULL,
  overall_score NUMERIC(3,2) CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 5)),
  strengths TEXT[] NOT NULL DEFAULT '{}',
  improvement_areas TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX evaluations_submission_id_idx ON public.evaluations(submission_id);

CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  score NUMERIC(3,2) NOT NULL CHECK (score >= 0 AND score <= 5),
  evidence TEXT NOT NULL DEFAULT '',
  concern TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL DEFAULT '',
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, criterion)
);
CREATE INDEX feedback_evaluation_id_idx ON public.feedback(evaluation_id);

GRANT SELECT ON public.problems TO anon, authenticated;
GRANT ALL ON public.problems TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.attempts TO anon, authenticated;
GRANT ALL ON public.attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.submissions TO anon, authenticated;
GRANT ALL ON public.submissions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.evaluations TO anon, authenticated;
GRANT ALL ON public.evaluations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.feedback TO anon, authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "problems_read" ON public.problems FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "attempts_read" ON public.attempts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "attempts_insert" ON public.attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "attempts_update" ON public.attempts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "submissions_read" ON public.submissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "submissions_insert" ON public.submissions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "submissions_update" ON public.submissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "evaluations_read" ON public.evaluations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "evaluations_insert" ON public.evaluations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "evaluations_update" ON public.evaluations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "feedback_read" ON public.feedback FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER submissions_touch_updated_at BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.problems (slug, title, description, difficulty, requirements, think_about) VALUES
('parking-lot', 'Parking Lot', 'Design the object model for a multi-floor parking lot that assigns spots to different vehicle types, issues tickets, and frees spots on exit.', 'Medium',
 ARRAY[
   'Support multiple floors, each with multiple parking spots',
   'Support different vehicle types (motorcycle, car, truck/bus)',
   'Support different spot types and their compatibility with vehicles',
   'Assign an appropriate spot to an arriving vehicle',
   'Release a spot when a vehicle leaves',
   'Generate and manage parking tickets',
   'Handle the case where no suitable spot is available'
 ],
 ARRAY[
   'Which class owns the responsibility of allocating a spot?',
   'How are vehicles, spots and tickets related without leaking internals?',
   'How would you swap in a different allocation strategy (nearest spot, cheapest spot)?',
   'Where do pricing and ticketing responsibilities belong?',
   'Edge cases: full lot, oversized vehicle, lost ticket, double exit'
 ]),
('vending-machine', 'Vending Machine', 'Design a vending machine that holds products, accepts payment, dispenses items, and returns change while moving through clear states.', 'Easy/Medium',
 ARRAY[
   'Hold multiple products with prices and stock levels',
   'Manage inventory as products are dispensed and restocked',
   'Allow the user to select a product',
   'Accept and track payment',
   'Complete a successful purchase',
   'Reject or hold on insufficient payment',
   'Handle product unavailable / out of stock',
   'Return change and refund a cancelled transaction'
 ],
 ARRAY[
   'What are the machine states and which transitions are legal?',
   'How do you keep money handling out of inventory logic?',
   'Who owns change calculation, and how would coin denominations change it?',
   'How is internal state encapsulated from the caller?',
   'Edge cases: exact change unavailable, cancel mid-transaction, concurrent selection'
 ]),
('elevator-system', 'Elevator System', 'Design an elevator control system that handles internal and external requests, moves cars between floors, and selects which elevator serves a request.', 'Medium',
 ARRAY[
   'Support one or more elevator cars in a building',
   'Accept floor requests from hall panels (external) and car panels (internal)',
   'Model elevator movement between floors and direction',
   'Model door open/close behaviour',
   'Select which elevator should serve an external request',
   'Handle multiple pending requests per elevator',
   'Provide basic scheduling logic for request ordering'
 ],
 ARRAY[
   'What state does an elevator car own versus the controller?',
   'How is the selection/scheduling policy abstracted so it can be replaced?',
   'How do internal and external requests differ in the model?',
   'How do multiple interacting objects stay loosely coupled?',
   'Edge cases: no elevator available, request for the current floor, doors blocked, idle parking'
 ]);