// internal/scraper/experience_parser.go
package scraper

import (
	"regexp"
	"strconv"
	"strings"
)

// ParseExperience extracts minimum and maximum experience from a job title.
func ParseExperience(title string) (int, int) {
	t := strings.ToLower(title)

	// 1. Immediate rejection for explicit senior keywords
	seniorKeywords := []string{"senior", "lead", "manager", "principal", "director", "vp", "architect", "head", "sr.", "sr "}
	for _, kw := range seniorKeywords {
		if strings.Contains(t, kw) {
			return 10, 10 // Flag as senior
		}
	}

	// 2. Match ranges like "8-10 years", "1 to 3 years", "0 - 2 yrs"
	rangeRe := regexp.MustCompile(`(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)`)
	if matches := rangeRe.FindStringSubmatch(t); len(matches) == 3 {
		min, _ := strconv.Atoi(matches[1])
		max, _ := strconv.Atoi(matches[2])

		// STRICT FILTER: If the role asks for more than 2 years max, reject it
		if max > 2 || min > 2 {
			return 10, 10
		}
		return min, max
	}

	// 3. Match single numbers like "5+ years", "2 yrs"
	singleRe := regexp.MustCompile(`(\d+)\+?\s*(?:years?|yrs?)`)
	if matches := singleRe.FindStringSubmatch(t); len(matches) == 2 {
		val, _ := strconv.Atoi(matches[1])

		// STRICT FILTER: If it asks for 3+ years, reject it
		if val > 2 {
			return 10, 10
		}
		return val, val
	}

	// 4. Keyword matching for entry-level roles
	entryKeywords := []string{
		"fresher", "graduate", "trainee", "intern",
		"entry level", "entry-level", "early career", "campus", "associate",
	}
	for _, kw := range entryKeywords {
		if strings.Contains(t, kw) {
			return 0, 1
		}
	}

	return -1, -1 // Unknown
}

// Add this to experience_parser.go
func ParseExperienceFromFullBody(desc string) (int, int) {
	d := strings.ToLower(desc)

	// Safety: Only look in the requirements section if possible
	// This is a naive but effective way to focus the search
	reqIdx := strings.Index(d, "what you need")
	if reqIdx != -1 {
		d = d[reqIdx:]
	}

	// Now look for numbers ONLY if they are near "years"
	// This regex looks for 1 digit followed by "years"
	re := regexp.MustCompile(`(\d+)\+?\s*(?:years?)`)
	matches := re.FindAllStringSubmatch(d, -1)

	minFound := 10 // Start high
	for _, match := range matches {
		val, _ := strconv.Atoi(match[1])
		if val < minFound {
			minFound = val
		}
	}

	if minFound > 5 {
		return -1, -1
	} // Probably a false positive (About Us section)
	return minFound, minFound
}
