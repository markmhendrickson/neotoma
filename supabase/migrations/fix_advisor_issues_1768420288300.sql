-- Migration: Fix Security Advisor issues
-- Generated: 2026-01-14T19:51:28.300Z
-- Description: Auto-generated fixes for 1 advisor issue(s)

-- Fix: RLS Disabled with Policies - public.interpretations
-- Table interpretations has policies but RLS is not enabled in migrations
ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;

