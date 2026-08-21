# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-21

### Added

- Repository bootstrap: license, security policy, CI, and release policy.
- G1 project registry: immutable project ids, alias resolution, tagged-union
  clone sources, two-layer catalog composition with tombstones and collision
  refusal, and `config_digest` snapshots.
- Import-boundary test that keeps interlock out of the dependency graph.
