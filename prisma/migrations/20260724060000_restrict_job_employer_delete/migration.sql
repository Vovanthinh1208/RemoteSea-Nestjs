-- Was ON DELETE CASCADE: deleting a User cascaded through EmployerProfile ->
-- Job -> Application/SavedJob, so an employer's self-service account
-- deletion (DELETE /users/me) silently destroyed every talent's application
-- history and saved-job bookmarks for that employer's job postings — data
-- those other users never chose to delete. RESTRICT makes the User delete
-- (and the EmployerProfile delete it cascades into) fail outright while any
-- Job still references the employer, instead of silently cascading through
-- it. UsersService.deleteAccount checks for this up front with a clear
-- error; this constraint is what actually guarantees it can't happen.
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_employerId_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
