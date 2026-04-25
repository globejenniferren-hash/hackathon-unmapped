#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript extract-wittgenstein.R <path-to-pop-age-edattain.rds> <output.json>")
}
rds_path <- args[[1]]
out_path <- args[[2]]

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("R package 'jsonlite' is required")
}

d <- readRDS(rds_path)

countries <- data.frame(
  wic_code = c(360L, 288L, 356L),
  iso3 = c("IDN", "GHA", "IND"),
  stringsAsFactors = FALSE
)

years <- c(2025L, 2030L, 2035L)
ages <- c("15--19", "20--24", "25--29", "30--34")

out <- list(
  source = "Wittgenstein Centre Human Capital Data Explorer (WIC), SSP2 (numeric scenario = 2)",
  indicator = "pop-age-edattain",
  rds_batch_url = "https://wicshiny2023.iiasa.ac.at/wcde-data/wcde-v3-batch/2/pop-age-edattain.rds",
  scenario = "SSP2",
  scenario_numeric = 2,
  age_bands = ages,
  age_scope_note = "Population shares are computed for ages 15–34 by summing WIC 5-year age groups 15--19, 20--24, 25--29, and 30--34 (WIC 'age' labels as stored in the batch file).",
  education_bucket_mapping = list(
    no_education_pct = list(wic_levels = list("No Education")),
    primary_pct = list(wic_levels = c("Incomplete Primary", "Primary")),
    secondary_pct = list(wic_levels = c("Lower Secondary", "Upper Secondary")),
    post_secondary_pct = list(
      wic_levels = c(
        "Post Secondary",
        "Short Post Secondary",
        "Bachelor",
        "Master and higher"
      )
    )
  ),
  formula = "For each country-year: bucket_pct = 100 * sum(pop where education in bucket) / sum(pop over all education rows in the four age bands, excluding 'Under 15').",
  countries = list(),
  extracted_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
)

for (i in seq_len(nrow(countries))) {
  cc <- countries$wic_code[[i]]
  iso <- countries$iso3[[i]]
  name0 <- stats::na.omit(unique(d$name[d$country_code == cc]))[[1]]
  proj <- list()
  for (yr in years) {
    sub <- d[
      d$country_code == cc &
        d$year == yr &
        d$age %in% ages,
    ]
    sub <- sub[sub$education != "Under 15", , drop = FALSE]
    tot <- sum(sub$pop)
    s_no <- sum(sub$pop[sub$education %in% c("No Education")])
    s_pr <- sum(sub$pop[sub$education %in% c("Incomplete Primary", "Primary")])
    s_se <- sum(sub$pop[sub$education %in% c("Lower Secondary", "Upper Secondary")])
    s_po <- sum(sub$pop[sub$education %in% c(
      "Post Secondary",
      "Short Post Secondary",
      "Bachelor",
      "Master and higher"
    )])
    proj[[as.character(yr)]] <- list(
      no_education_pct = round(100 * s_no / tot, 6),
      primary_pct = round(100 * s_pr / tot, 6),
      secondary_pct = round(100 * s_se / tot, 6),
      post_secondary_pct = round(100 * s_po / tot, 6),
      population_thousands = round(tot, 3)
    )
  }
  out$countries[[iso]] <- list(name = name0, projections = proj)
}

jsonlite::write_json(out, out_path, auto_unbox = TRUE, pretty = TRUE)
