// internal/api/server.go
package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/AkshajV/SpearFish/internal/database"
	"github.com/AkshajV/SpearFish/internal/resume"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func StartServer(pool *pgxpool.Pool) {
	mux := http.NewServeMux()

	// ── GET /api/jobs ─────────────────────────────────────────────────────────
	mux.HandleFunc("/api/jobs", func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, "GET, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")

		q := r.URL.Query()
		limit, offset := 20, 0
		minExp, maxExp := -1, -1

		if v := q.Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				limit = min(n, 50)
			}
		}
		if v := q.Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 0 {
				offset = n
			}
		}
		if v := q.Get("min_exp"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				minExp = n
			}
		}
		if v := q.Get("max_exp"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				maxExp = n
			}
		}

		search := truncate(q.Get("search"), 100)
		location := truncate(q.Get("location"), 50)
		excludeCompany := q.Get("exclude_company")

		jobs, err := database.GetJobs(pool, limit, offset, search, minExp, maxExp, location, excludeCompany)
		if err != nil {
			log.Printf("GetJobs error: %v", err)
			http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
			return
		}
		jsonResponse(w, coalesceJobs(jobs))
	})

	// ── POST /api/resume/match ─────────────────────────────────────────────────
	// Accepts a PDF resume, parses it with Gemini, and returns a ranked job list.
	mux.HandleFunc("/api/resume/match", func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, "POST, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")

		// 5MB limit — more than enough for any resume
		if err := r.ParseMultipartForm(5 << 20); err != nil {
			http.Error(w, `{"error": "File too large or invalid form data"}`, http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("resume")
		if err != nil {
			http.Error(w, `{"error": "No resume file provided (field name: resume)"}`, http.StatusBadRequest)
			return
		}
		defer file.Close()

		if !strings.HasSuffix(strings.ToLower(header.Filename), ".pdf") {
			http.Error(w, `{"error": "Only PDF files are supported"}`, http.StatusBadRequest)
			return
		}

		pdfBytes, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, `{"error": "Failed to read uploaded file"}`, http.StatusInternalServerError)
			return
		}

		apiKey := os.Getenv("GEMINI_API_KEY")
		if apiKey == "" {
			http.Error(w, `{"error": "AI service not configured on server"}`, http.StatusInternalServerError)
			return
		}

		log.Printf("Resume upload: %s (%d bytes) — sending to Gemini", header.Filename, len(pdfBytes))

		profile, err := resume.ParseResume(apiKey, pdfBytes)
		if err != nil {
			log.Printf("Resume parse error: %v", err)
			http.Error(w, `{"error": "Failed to analyze resume. Check that it is a valid readable PDF."}`, http.StatusInternalServerError)
			return
		}

		log.Printf("Resume parsed: %s | Skills: %v", profile.Summary, profile.Skills)

		searchQuery := resume.BuildSearchQuery(profile)
		jobs, err := database.GetJobsByKeywords(pool, searchQuery, 50)
		if err != nil {
			log.Printf("Resume job match error: %v", err)
			http.Error(w, `{"error": "Failed to match jobs against resume"}`, http.StatusInternalServerError)
			return
		}

		jsonResponse(w, map[string]interface{}{
			"profile": profile,
			"jobs":    coalesceJobs(jobs),
		})
	})

	// ── GET /api/jobs/saved ───────────────────────────────────────────────────
	mux.HandleFunc("/api/jobs/saved", AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, "GET, OPTIONS")
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		email := r.Context().Value(UserEmailKey).(string)
		jobs, err := database.GetSavedJobs(pool, email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, coalesceJobs(jobs))
	}))

	// ── POST /api/users/sync ──────────────────────────────────────────────────
	mux.HandleFunc("/api/users/sync", func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, "POST, OPTIONS")
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		var payload struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if _, err := database.EnsureUserExists(pool, payload.Email); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// ── POST /api/jobs/track ──────────────────────────────────────────────────
	mux.HandleFunc("/api/jobs/track", AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			return
		}
		email := r.Context().Value(UserEmailKey).(string)

		var payload struct {
			JobID  string `json:"job_id"`
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		jobUUID, err := uuid.Parse(payload.JobID)
		if err != nil {
			http.Error(w, "Invalid job ID", http.StatusBadRequest)
			return
		}
		if err := database.TrackJobApplication(pool, email, jobUUID, payload.Status); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// ── POST /api/jobs/unsave ─────────────────────────────────────────────────
	mux.HandleFunc("/api/jobs/unsave", AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			return
		}
		email := r.Context().Value(UserEmailKey).(string)

		var payload struct {
			JobID string `json:"job_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		jobUUID, err := uuid.Parse(payload.JobID)
		if err != nil {
			http.Error(w, "Invalid job ID", http.StatusBadRequest)
			return
		}
		if err := database.UnarchiveJobApplication(pool, email, jobUUID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// ── POST /api/jobs/manual ─────────────────────────────────────────────────
	mux.HandleFunc("/api/jobs/manual", AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			return
		}
		email := r.Context().Value(UserEmailKey).(string)

		var payload struct {
			Title    string `json:"title"`
			Company  string `json:"company"`
			Location string `json:"location"`
			URL      string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		jobID, err := database.TrackManualJob(pool, email, payload.Title, payload.Company, payload.Location, payload.URL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": jobID.String()})
	}))

	// ── Server config ─────────────────────────────────────────────────────────
	// ReadTimeout is 60s (not 5s) to handle PDF uploads on slow connections.
	// WriteTimeout is 60s to give Gemini time to respond.
	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Println("SpearFish API starting on :8080")
	log.Fatal(srv.ListenAndServe())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func setCORSHeaders(w http.ResponseWriter, methods string) {
	// 1. Check for the Render environment variable you just added
	frontendURL := os.Getenv("NEXT_PUBLIC_API_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000" // Fallback for local development
	}

	w.Header().Set("Access-Control-Allow-Origin", frontendURL)
	w.Header().Set("Access-Control-Allow-Methods", methods)
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-Email")
}

func jsonResponse(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func coalesceJobs(jobs []database.Job) []database.Job {
	if jobs == nil {
		return []database.Job{}
	}
	return jobs
}

func truncate(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
