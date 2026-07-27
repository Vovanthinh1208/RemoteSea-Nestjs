// Shared by ApplicationsRepository.findJobIdsByTalentId and
// SavedRepository.findJobIdsForUser — both return an unpaginated id-only
// "membership set" the client uses for correctness checks (already applied?/
// already saved?), not a display list. A page-sized cap would silently
// truncate the set and produce wrong answers for jobs beyond it, so this is
// only a DoS/runaway-query backstop, set far above what the rate-limited
// apply/save flows could plausibly produce for a real user.
export const MEMBERSHIP_SET_CAP = 5_000;
