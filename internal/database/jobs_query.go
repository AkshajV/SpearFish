// internal/database/jobs_query.go
package database

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Job struct {
	ID              uuid.UUID `json:"id"`
	JobTitle        string    `json:"job_title"`
	CompanyName     string    `json:"company_name"`
	Location        string    `json:"location"`
	Description     string    `json:"description"`
	JobURL          string    `json:"job_url"`
	ExperienceMin   int       `json:"experience_min"`
	ExperienceMax   int       `json:"experience_max"`
	ExperienceLevel string    `json:"experience_level"`
	Source          string    `json:"source"`
}

// GetJobs is the standard paginated job feed with optional filters.
func GetJobs(pool *pgxpool.Pool, limit, offset int, search string, minExp, maxExp int, location string, excludeCompany string) ([]Job, error) {
	ctx := context.Background()

	baseQuery := `
		SELECT j.id, j.job_title, c.name, j.location, j.description,
		       j.job_url, j.experience_min, j.experience_max, j.experience_level, j.source
		FROM jobs j
		JOIN companies c ON j.company_id = c.id
	`

	var whereClauses []string
	var args []interface{}
	argID := 1

	if search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("LOWER(j.job_title) LIKE $%d", argID))
		args = append(args, "%"+strings.ToLower(search)+"%")
		argID++
	}

	if location != "" {
		cleanLoc := strings.TrimSpace(location)
		// Handle Bangalore / Bengaluru spelling variants
		if strings.EqualFold(cleanLoc, "bengaluru") || strings.EqualFold(cleanLoc, "bangalore") {
			whereClauses = append(whereClauses, fmt.Sprintf("(j.location ILIKE $%d OR j.location ILIKE $%d)", argID, argID+1))
			args = append(args, "%bengaluru%", "%bangalore%")
			argID += 2
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("j.location ILIKE $%d", argID))
			args = append(args, "%"+cleanLoc+"%")
			argID++
		}
	}

	if excludeCompany != "" {
		for _, ex := range strings.Split(excludeCompany, ",") {
			if clean := strings.TrimSpace(ex); clean != "" {
				whereClauses = append(whereClauses, fmt.Sprintf("LOWER(c.name) NOT LIKE $%d", argID))
				args = append(args, "%"+strings.ToLower(clean)+"%")
				argID++
			}
		}
	}

	// -1 means "not provided" — skip the filter entirely
	if minExp >= 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("j.experience_max >= $%d", argID))
		args = append(args, minExp)
		argID++
	}
	if maxExp >= 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("j.experience_min <= $%d", argID))
		args = append(args, maxExp)
		argID++
	}

	if len(whereClauses) > 0 {
		baseQuery += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	baseQuery += fmt.Sprintf(" ORDER BY j.created_at DESC LIMIT $%d OFFSET $%d", argID, argID+1)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query jobs: %w", err)
	}
	defer rows.Close()

	return scanJobs(rows)
}

// GetJobsByKeywords ranks all jobs by full-text relevance to the provided search query.
// Used for resume-based matching — returns the most relevant jobs first.
// The searchQuery should be formatted for websearch_to_tsquery (e.g. "GRC OR \"Security Analyst\" OR Python").
func GetJobsByKeywords(pool *pgxpool.Pool, searchQuery string, limit int) ([]Job, error) {
	ctx := context.Background()

	// ts_rank_cd scores how well the document matches the query.
	// Jobs with no keyword matches score 0 and fall to the bottom,
	// ordered by recency as a tiebreaker.
	query := `
		SELECT j.id, j.job_title, c.name, j.location, j.description,
		       j.job_url, j.experience_min, j.experience_max, j.experience_level, j.source
		FROM jobs j
		JOIN companies c ON j.company_id = c.id
		ORDER BY
			ts_rank_cd(
				to_tsvector('english', j.job_title || ' ' || COALESCE(j.description, '')),
				websearch_to_tsquery('english', $1)
			) DESC,
			j.created_at DESC
		LIMIT $2
	`

	rows, err := pool.Query(ctx, query, searchQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query jobs by keywords: %w", err)
	}
	defer rows.Close()

	return scanJobs(rows)
}

// GetSavedJobs returns all jobs saved by a specific user.
func GetSavedJobs(pool *pgxpool.Pool, email string) ([]Job, error) {
	ctx := context.Background()

	query := `
		SELECT j.id, j.job_title, c.name, j.location, j.description,
		       j.job_url, j.experience_min, j.experience_max, j.experience_level, j.source
		FROM jobs j
		JOIN companies c ON j.company_id = c.id
		JOIN applications a ON j.id = a.job_id
		JOIN users u ON a.user_id = u.id
		WHERE u.email = $1 AND a.status = 'Saved'
		ORDER BY a.id DESC
	`

	rows, err := pool.Query(ctx, query, email)
	if err != nil {
		return nil, fmt.Errorf("failed to query saved jobs: %w", err)
	}
	defer rows.Close()

	return scanJobs(rows)
}

// scanJobs is a shared row scanner to avoid repetition across query functions.
func scanJobs(rows interface {
	Next() bool
	Scan(...any) error
	Close()
}) ([]Job, error) {
	defer rows.Close()
	var jobs []Job
	for rows.Next() {
		var job Job
		if err := rows.Scan(
			&job.ID, &job.JobTitle, &job.CompanyName, &job.Location,
			&job.Description, &job.JobURL, &job.ExperienceMin, &job.ExperienceMax,
			&job.ExperienceLevel, &job.Source,
		); err != nil {
			return nil, fmt.Errorf("failed to scan job row: %w", err)
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}
