--
-- PostgreSQL database dump
--


-- Dumped from database version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: EXTENSION fuzzystrmatch; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION fuzzystrmatch IS 'determine similarities and distance between strings';


--
-- Name: ab_tests_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ab_tests_status_enum AS ENUM (
    'running',
    'concluded',
    'cancelled'
);


--
-- Name: auth_logs_action_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auth_logs_action_enum AS ENUM (
    'login_success',
    'login_failure',
    'logout',
    'register',
    'forgot_password',
    'reset_password',
    'token_invalid',
    'unauthorized'
);


--
-- Name: fraud_flags_entity_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fraud_flags_entity_type_enum AS ENUM (
    'vendor',
    'offer'
);


--
-- Name: fraud_flags_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fraud_flags_status_enum AS ENUM (
    'pending',
    'reviewed',
    'dismissed'
);


--
-- Name: group_deals_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.group_deals_status_enum AS ENUM (
    'active',
    'fulfilled',
    'expired',
    'cancelled'
);


--
-- Name: payments_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payments_status_enum AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded'
);


--
-- Name: support_tickets_priority_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_tickets_priority_enum AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: support_tickets_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_tickets_status_enum AS ENUM (
    'open',
    'answered',
    'closed'
);


--
-- Name: user_interactions_action_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_interactions_action_enum AS ENUM (
    'view',
    'click',
    'save',
    'redeem',
    'share',
    'skip',
    'search',
    'direction'
);


--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_role_enum AS ENUM (
    'user',
    'vendor',
    'admin'
);


--
-- Name: vendors_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vendors_status_enum AS ENUM (
    'pending_review',
    'approved',
    'rejected',
    'suspended',
    'fraud_review'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_tests (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    name character varying(200) NOT NULL,
    offer_id_a integer NOT NULL,
    offer_id_b integer NOT NULL,
    winner_offer_id integer,
    status public.ab_tests_status_enum DEFAULT 'running'::public.ab_tests_status_enum,
    ends_at timestamp without time zone,
    concluded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ab_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ab_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ab_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ab_tests_id_seq OWNED BY public.ab_tests.id;


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id bigint NOT NULL,
    request_id character varying(36),
    user_id integer NOT NULL,
    role character varying(20) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id integer,
    description character varying(500),
    metadata json,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: alert_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_logs (
    id integer NOT NULL,
    alert_type character varying(100) NOT NULL,
    severity character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    metadata json,
    notified_channels json,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: alert_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_logs_id_seq OWNED BY public.alert_logs.id;


--
-- Name: api_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_logs (
    id bigint NOT NULL,
    request_id character varying(36),
    user_id integer,
    role character varying(20),
    ip_address character varying(45) NOT NULL,
    method character varying(10) NOT NULL,
    endpoint character varying(500) NOT NULL,
    status_code integer NOT NULL,
    request_body text,
    response_body text,
    user_agent character varying(500),
    device_info json,
    response_time_ms integer,
    is_suspicious boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: api_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_logs_id_seq OWNED BY public.api_logs.id;


--
-- Name: auth_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_logs (
    id bigint NOT NULL,
    request_id character varying(36),
    user_id integer,
    email character varying(255),
    role character varying(20),
    action public.auth_logs_action_enum NOT NULL,
    ip_address character varying(45) NOT NULL,
    user_agent character varying(500),
    device_info json,
    failure_reason character varying(500),
    metadata json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_logs_id_seq OWNED BY public.auth_logs.id;


--
-- Name: banner_ad_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner_ad_requests (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    image_url text NOT NULL,
    target_url character varying(500),
    "position" character varying(50) DEFAULT 'top'::character varying NOT NULL,
    duration_days integer DEFAULT 7 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    review_note text,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    banner_plan_id integer,
    price numeric(10,2),
    title character varying(150),
    media_type character varying(10) DEFAULT 'image'::character varying,
    starts_at timestamp without time zone,
    razorpay_order_id character varying(64),
    paid_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: banner_ad_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banner_ad_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banner_ad_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banner_ad_requests_id_seq OWNED BY public.banner_ad_requests.id;


--
-- Name: banner_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner_clicks (
    id integer NOT NULL,
    banner_id integer NOT NULL,
    user_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: banner_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banner_clicks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banner_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banner_clicks_id_seq OWNED BY public.banner_clicks.id;


--
-- Name: banner_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner_impressions (
    id integer NOT NULL,
    banner_id integer NOT NULL,
    user_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: banner_impressions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banner_impressions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banner_impressions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banner_impressions_id_seq OWNED BY public.banner_impressions.id;


--
-- Name: banner_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner_plans (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    duration_days integer NOT NULL,
    price numeric(10,2) NOT NULL,
    description character varying(200),
    "position" character varying(20) DEFAULT 'any'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: banner_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banner_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banner_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banner_plans_id_seq OWNED BY public.banner_plans.id;


--
-- Name: blocked_ips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_ips (
    id integer NOT NULL,
    ip_address character varying(45) NOT NULL,
    reason text,
    blocked_by integer,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_ips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocked_ips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocked_ips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocked_ips_id_seq OWNED BY public.blocked_ips.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    icon character varying(100),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: email_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_change_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    new_email character varying(150) NOT NULL,
    otp character varying(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: email_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_change_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_change_requests_id_seq OWNED BY public.email_change_requests.id;


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id bigint NOT NULL,
    request_id character varying(36),
    user_id integer,
    ip_address character varying(45),
    endpoint character varying(500),
    method character varying(10),
    status_code integer,
    error_type character varying(100) NOT NULL,
    error_message text NOT NULL,
    stack_trace text,
    metadata json,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.error_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: error_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.error_logs_id_seq OWNED BY public.error_logs.id;


--
-- Name: fraud_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_flags (
    id integer NOT NULL,
    entity_type public.fraud_flags_entity_type_enum NOT NULL,
    entity_id integer NOT NULL,
    flag_reason text,
    confidence_score integer DEFAULT 0,
    status public.fraud_flags_status_enum DEFAULT 'pending'::public.fraud_flags_status_enum,
    review_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fraud_flags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fraud_flags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fraud_flags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fraud_flags_id_seq OWNED BY public.fraud_flags.id;


--
-- Name: group_deal_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_deal_members (
    id integer NOT NULL,
    deal_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: group_deal_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.group_deal_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_deal_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.group_deal_members_id_seq OWNED BY public.group_deal_members.id;


--
-- Name: group_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_deals (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    min_members integer DEFAULT 5 NOT NULL,
    max_members integer,
    status public.group_deals_status_enum DEFAULT 'active'::public.group_deals_status_enum,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: group_deals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.group_deals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_deals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.group_deals_id_seq OWNED BY public.group_deals.id;


--
-- Name: leaderboard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard (
    id integer NOT NULL,
    user_id integer NOT NULL,
    period character varying(20) NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    city character varying(100)
);


--
-- Name: leaderboard_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leaderboard_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leaderboard_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leaderboard_id_seq OWNED BY public.leaderboard.id;


--
-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_outbox (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(255) NOT NULL,
    body text NOT NULL,
    type character varying(50) DEFAULT 'push'::character varying NOT NULL,
    data jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_outbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_outbox_id_seq OWNED BY public.notification_outbox.id;


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id integer NOT NULL,
    activity_type character varying(40) NOT NULL,
    category character varying(40) NOT NULL,
    label character varying(120) NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_settings_id_seq OWNED BY public.notification_settings.id;


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id integer NOT NULL,
    type character varying(40) NOT NULL,
    title character varying(150) NOT NULL,
    body text NOT NULL,
    route character varying(100) DEFAULT '/feed'::character varying NOT NULL,
    language character varying(10) DEFAULT 'ta'::character varying NOT NULL,
    is_ai_generated boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_templates_id_seq OWNED BY public.notification_templates.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(255) NOT NULL,
    body text,
    type character varying(50) DEFAULT 'push'::character varying,
    offer_id integer,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: offer_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_impressions (
    id bigint NOT NULL,
    offer_id integer NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offer_impressions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offer_impressions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offer_impressions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offer_impressions_id_seq OWNED BY public.offer_impressions.id;


--
-- Name: offer_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_reports (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    user_id integer NOT NULL,
    reason character varying(40) NOT NULL,
    details text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: offer_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offer_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offer_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offer_reports_id_seq OWNED BY public.offer_reports.id;


--
-- Name: offer_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_reviews (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    user_id integer NOT NULL,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vendor_reply text,
    replied_at timestamp without time zone,
    hidden_by_admin boolean DEFAULT false NOT NULL
);


--
-- Name: offer_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offer_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offer_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offer_reviews_id_seq OWNED BY public.offer_reviews.id;


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    title character varying(300) NOT NULL,
    description text,
    category character varying(100) DEFAULT 'general'::character varying,
    image_url text,
    coupon_code character varying(100),
    redeem_url text,
    discount_percent numeric(5,2) DEFAULT '0'::numeric,
    original_price numeric(12,2),
    offer_price numeric(12,2),
    max_redemptions integer DEFAULT 0,
    current_redemptions integer DEFAULT 0,
    views integer DEFAULT 0,
    clicks integer DEFAULT 0,
    saves integer DEFAULT 0,
    shares integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    valid_from timestamp without time zone,
    valid_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    images text,
    coins_required integer DEFAULT 0 NOT NULL,
    category_id integer,
    featured_start_at timestamp without time zone,
    featured_until timestamp without time zone,
    featured_order integer DEFAULT 0
);


--
-- Name: offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offers_id_seq OWNED BY public.offers.id;


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: password_resets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_resets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_resets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_resets_id_seq OWNED BY public.password_resets.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    order_id character varying(100) NOT NULL,
    payment_session_id character varying(255),
    cashfree_payment_id character varying(100),
    amount numeric(12,2) NOT NULL,
    status public.payments_status_enum DEFAULT 'pending'::public.payments_status_enum,
    purpose character varying(100),
    reference_id integer,
    reference_type character varying(50),
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: razorpay_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.razorpay_payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    order_id character varying(64) NOT NULL,
    payment_id character varying(64),
    amount integer NOT NULL,
    currency character varying(8) DEFAULT 'INR'::character varying NOT NULL,
    receipt character varying(128),
    status character varying(16) DEFAULT 'created'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    verified_at timestamp without time zone
);


--
-- Name: razorpay_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.razorpay_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: razorpay_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.razorpay_payments_id_seq OWNED BY public.razorpay_payments.id;


--
-- Name: redemption_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redemption_codes (
    id integer NOT NULL,
    offer_id integer NOT NULL,
    user_id integer NOT NULL,
    code character varying(8) NOT NULL,
    status character varying(12) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    verified_at timestamp without time zone,
    verified_by integer,
    expires_at timestamp without time zone
);


--
-- Name: redemption_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.redemption_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: redemption_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.redemption_codes_id_seq OWNED BY public.redemption_codes.id;


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id integer NOT NULL,
    referrer_id integer NOT NULL,
    referred_id integer NOT NULL,
    coins_awarded integer DEFAULT 50,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referrals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referrals_id_seq OWNED BY public.referrals.id;


--
-- Name: saved_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_offers (
    id integer NOT NULL,
    user_id integer NOT NULL,
    offer_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_offers_id_seq OWNED BY public.saved_offers.id;


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id integer NOT NULL,
    event_type character varying(100) NOT NULL,
    severity character varying(20) NOT NULL,
    user_id integer,
    ip_address character varying(45) NOT NULL,
    endpoint character varying(500),
    description text NOT NULL,
    metadata json,
    is_resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp without time zone,
    resolved_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_events_id_seq OWNED BY public.security_events.id;


--
-- Name: share_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_events (
    id integer NOT NULL,
    user_id integer NOT NULL,
    offer_id integer NOT NULL,
    platform character varying(50) DEFAULT 'general'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: share_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.share_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: share_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.share_events_id_seq OWNED BY public.share_events.id;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key character varying(100) NOT NULL,
    value text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: spotlight_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotlight_requests (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    offer_id integer,
    message text,
    duration_days integer DEFAULT 7 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: spotlight_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spotlight_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spotlight_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spotlight_requests_id_seq OWNED BY public.spotlight_requests.id;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    duration_days integer DEFAULT 30 NOT NULL,
    max_offers integer,
    features json,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    feature_flags json DEFAULT '[]'::json,
    annual_price numeric(10,2)
);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: support_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_replies (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    user_id integer NOT NULL,
    message text NOT NULL,
    is_staff boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: support_replies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_replies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_replies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_replies_id_seq OWNED BY public.support_replies.id;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subject character varying(255) NOT NULL,
    message text NOT NULL,
    category character varying(100) DEFAULT 'general'::character varying,
    status public.support_tickets_status_enum DEFAULT 'open'::public.support_tickets_status_enum,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    priority public.support_tickets_priority_enum DEFAULT 'medium'::public.support_tickets_priority_enum,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_id_seq OWNED BY public.support_tickets.id;


--
-- Name: user_fcm_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_fcm_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    platform character varying(20) DEFAULT 'web'::character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_fcm_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_fcm_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_fcm_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_fcm_tokens_id_seq OWNED BY public.user_fcm_tokens.id;


--
-- Name: user_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_interactions (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    offer_id integer,
    action public.user_interactions_action_enum NOT NULL,
    category character varying(100),
    search_term character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_interactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_interactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_interactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_interactions_id_seq OWNED BY public.user_interactions.id;


--
-- Name: user_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_locations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    lat numeric(10,8) NOT NULL,
    lng numeric(11,8) NOT NULL,
    city character varying(100),
    accuracy double precision,
    source character varying(20) DEFAULT 'gps'::character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_locations_id_seq OWNED BY public.user_locations.id;


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id integer NOT NULL,
    user_id integer NOT NULL,
    preferred_categories json,
    preferred_vendors json,
    max_distance_km integer DEFAULT 15,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_preferences_id_seq OWNED BY public.user_preferences.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    phone character varying(20),
    password_hash character varying(255),
    role public.users_role_enum DEFAULT 'user'::public.users_role_enum NOT NULL,
    google_id character varying(100),
    avatar_url text,
    city character varying(100),
    lat numeric(10,8),
    lng numeric(11,8),
    is_active boolean DEFAULT true NOT NULL,
    last_login date,
    login_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    coins integer DEFAULT 0 NOT NULL,
    referral_code character varying(20),
    token_invalidated_at bigint,
    email_alerts boolean DEFAULT true NOT NULL,
    streak_count integer DEFAULT 0 NOT NULL,
    last_checkin date,
    admin_role character varying(30),
    excluded_from_leaderboard boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_applications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    business_name character varying(200) NOT NULL,
    category character varying(100),
    city character varying(100),
    address text,
    phone character varying(20),
    website character varying(255),
    gst_number character varying(50),
    description text,
    lat numeric(10,7),
    lng numeric(10,7),
    logo_url text,
    plan_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: vendor_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_applications_id_seq OWNED BY public.vendor_applications.id;


--
-- Name: vendor_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_daily_stats (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    stat_date date NOT NULL,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    saves integer DEFAULT 0,
    redemptions integer DEFAULT 0
);


--
-- Name: vendor_daily_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_daily_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_daily_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_daily_stats_id_seq OWNED BY public.vendor_daily_stats.id;


--
-- Name: vendor_followers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_followers (
    id integer NOT NULL,
    user_id integer NOT NULL,
    vendor_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vendor_followers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_followers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_followers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_followers_id_seq OWNED BY public.vendor_followers.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    user_id integer NOT NULL,
    business_name character varying(200) NOT NULL,
    category character varying(100),
    city character varying(100),
    address text,
    lat numeric(10,8),
    lng numeric(11,8),
    phone character varying(20),
    website character varying(255),
    gst_number character varying(50),
    logo_url text,
    description text,
    status public.vendors_status_enum DEFAULT 'pending_review'::public.vendors_status_enum NOT NULL,
    review_note text,
    subscription_plan character varying(50) DEFAULT 'starter'::character varying,
    plan_expires_at timestamp without time zone,
    total_followers integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: ab_tests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests ALTER COLUMN id SET DEFAULT nextval('public.ab_tests_id_seq'::regclass);


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Name: alert_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_logs ALTER COLUMN id SET DEFAULT nextval('public.alert_logs_id_seq'::regclass);


--
-- Name: api_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs ALTER COLUMN id SET DEFAULT nextval('public.api_logs_id_seq'::regclass);


--
-- Name: auth_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_logs ALTER COLUMN id SET DEFAULT nextval('public.auth_logs_id_seq'::regclass);


--
-- Name: banner_ad_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_ad_requests ALTER COLUMN id SET DEFAULT nextval('public.banner_ad_requests_id_seq'::regclass);


--
-- Name: banner_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_clicks ALTER COLUMN id SET DEFAULT nextval('public.banner_clicks_id_seq'::regclass);


--
-- Name: banner_impressions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_impressions ALTER COLUMN id SET DEFAULT nextval('public.banner_impressions_id_seq'::regclass);


--
-- Name: banner_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_plans ALTER COLUMN id SET DEFAULT nextval('public.banner_plans_id_seq'::regclass);


--
-- Name: blocked_ips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips ALTER COLUMN id SET DEFAULT nextval('public.blocked_ips_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: email_change_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_change_requests ALTER COLUMN id SET DEFAULT nextval('public.email_change_requests_id_seq'::regclass);


--
-- Name: error_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs ALTER COLUMN id SET DEFAULT nextval('public.error_logs_id_seq'::regclass);


--
-- Name: fraud_flags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_flags ALTER COLUMN id SET DEFAULT nextval('public.fraud_flags_id_seq'::regclass);


--
-- Name: group_deal_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_deal_members ALTER COLUMN id SET DEFAULT nextval('public.group_deal_members_id_seq'::regclass);


--
-- Name: group_deals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_deals ALTER COLUMN id SET DEFAULT nextval('public.group_deals_id_seq'::regclass);


--
-- Name: leaderboard id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard ALTER COLUMN id SET DEFAULT nextval('public.leaderboard_id_seq'::regclass);


--
-- Name: notification_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox ALTER COLUMN id SET DEFAULT nextval('public.notification_outbox_id_seq'::regclass);


--
-- Name: notification_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings ALTER COLUMN id SET DEFAULT nextval('public.notification_settings_id_seq'::regclass);


--
-- Name: notification_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates ALTER COLUMN id SET DEFAULT nextval('public.notification_templates_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: offer_impressions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_impressions ALTER COLUMN id SET DEFAULT nextval('public.offer_impressions_id_seq'::regclass);


--
-- Name: offer_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reports ALTER COLUMN id SET DEFAULT nextval('public.offer_reports_id_seq'::regclass);


--
-- Name: offer_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reviews ALTER COLUMN id SET DEFAULT nextval('public.offer_reviews_id_seq'::regclass);


--
-- Name: offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers ALTER COLUMN id SET DEFAULT nextval('public.offers_id_seq'::regclass);


--
-- Name: password_resets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets ALTER COLUMN id SET DEFAULT nextval('public.password_resets_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: razorpay_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments ALTER COLUMN id SET DEFAULT nextval('public.razorpay_payments_id_seq'::regclass);


--
-- Name: redemption_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_codes ALTER COLUMN id SET DEFAULT nextval('public.redemption_codes_id_seq'::regclass);


--
-- Name: referrals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals ALTER COLUMN id SET DEFAULT nextval('public.referrals_id_seq'::regclass);


--
-- Name: saved_offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_offers ALTER COLUMN id SET DEFAULT nextval('public.saved_offers_id_seq'::regclass);


--
-- Name: security_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events ALTER COLUMN id SET DEFAULT nextval('public.security_events_id_seq'::regclass);


--
-- Name: share_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events ALTER COLUMN id SET DEFAULT nextval('public.share_events_id_seq'::regclass);


--
-- Name: spotlight_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_requests ALTER COLUMN id SET DEFAULT nextval('public.spotlight_requests_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: support_replies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_replies ALTER COLUMN id SET DEFAULT nextval('public.support_replies_id_seq'::regclass);


--
-- Name: support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN id SET DEFAULT nextval('public.support_tickets_id_seq'::regclass);


--
-- Name: user_fcm_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_fcm_tokens ALTER COLUMN id SET DEFAULT nextval('public.user_fcm_tokens_id_seq'::regclass);


--
-- Name: user_interactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interactions ALTER COLUMN id SET DEFAULT nextval('public.user_interactions_id_seq'::regclass);


--
-- Name: user_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations ALTER COLUMN id SET DEFAULT nextval('public.user_locations_id_seq'::regclass);


--
-- Name: user_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_preferences_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_applications ALTER COLUMN id SET DEFAULT nextval('public.vendor_applications_id_seq'::regclass);


--
-- Name: vendor_daily_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_daily_stats ALTER COLUMN id SET DEFAULT nextval('public.vendor_daily_stats_id_seq'::regclass);


--
-- Name: vendor_followers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_followers ALTER COLUMN id SET DEFAULT nextval('public.vendor_followers_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: saved_offers PK_0054025d96dc5f043842451ab4a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_offers
    ADD CONSTRAINT "PK_0054025d96dc5f043842451ab4a" PRIMARY KEY (id);


--
-- Name: fraud_flags PK_00fccadb758d1624e0831fe026a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_flags
    ADD CONSTRAINT "PK_00fccadb758d1624e0831fe026a" PRIMARY KEY (id);


--
-- Name: vendor_applications PK_040e931a5acccc7051d7f726520; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_applications
    ADD CONSTRAINT "PK_040e931a5acccc7051d7f726520" PRIMARY KEY (id);


--
-- Name: user_interactions PK_173313ad3f40a2ae74b48f82dd7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interactions
    ADD CONSTRAINT "PK_173313ad3f40a2ae74b48f82dd7" PRIMARY KEY (id);


--
-- Name: payments PK_197ab7af18c93fbb0c9b28b4a59; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id);


--
-- Name: support_replies PK_203c1208336ab63897e4eba3f5e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_replies
    ADD CONSTRAINT "PK_203c1208336ab63897e4eba3f5e" PRIMARY KEY (id);


--
-- Name: categories PK_24dbc6126a28ff948da33e97d3b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY (id);


--
-- Name: offer_reviews PK_3f08fcf46fda6e5af59789fe40d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reviews
    ADD CONSTRAINT "PK_3f08fcf46fda6e5af59789fe40d" PRIMARY KEY (id);


--
-- Name: share_events PK_43870adb21d3a0fcdb798fae692; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT "PK_43870adb21d3a0fcdb798fae692" PRIMARY KEY (id);


--
-- Name: password_resets PK_4816377aa98211c1de34469e742; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY (id);


--
-- Name: user_locations PK_4afd5dae13173e88183db3cd210; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT "PK_4afd5dae13173e88183db3cd210" PRIMARY KEY (id);


--
-- Name: offers PK_4c88e956195bba85977da21b8f4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT "PK_4c88e956195bba85977da21b8f4" PRIMARY KEY (id);


--
-- Name: banner_ad_requests PK_5c01760ad334cce21eb47bf0ad6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_ad_requests
    ADD CONSTRAINT "PK_5c01760ad334cce21eb47bf0ad6" PRIMARY KEY (id);


--
-- Name: error_logs PK_6840885d7eb78406fa7d358be72; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT "PK_6840885d7eb78406fa7d358be72" PRIMARY KEY (id);


--
-- Name: notifications PK_6a72c3c0f683f6462415e653c3a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);


--
-- Name: security_events PK_6fc100d6700780737348df0d3ae; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT "PK_6fc100d6700780737348df0d3ae" PRIMARY KEY (id);


--
-- Name: notification_templates PK_76f0fc48b8d057d2ae7f3a2848a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT "PK_76f0fc48b8d057d2ae7f3a2848a" PRIMARY KEY (id);


--
-- Name: leaderboard PK_76fd1d52cf44d209920f73f4608; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard
    ADD CONSTRAINT "PK_76fd1d52cf44d209920f73f4608" PRIMARY KEY (id);


--
-- Name: group_deal_members PK_7e5b5a23340aaba50f1cc1452bb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_deal_members
    ADD CONSTRAINT "PK_7e5b5a23340aaba50f1cc1452bb" PRIMARY KEY (id);


--
-- Name: offer_reports PK_831bef796cf54a49e1917c8bee1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reports
    ADD CONSTRAINT "PK_831bef796cf54a49e1917c8bee1" PRIMARY KEY (id);


--
-- Name: alert_logs PK_839d59dc0124b583ee4233a7df9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_logs
    ADD CONSTRAINT "PK_839d59dc0124b583ee4233a7df9" PRIMARY KEY (id);


--
-- Name: notification_outbox PK_83d47c7dba1da2d038749fe757e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT "PK_83d47c7dba1da2d038749fe757e" PRIMARY KEY (id);


--
-- Name: ab_tests PK_897aac79b4b31d3d500c15a6810; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT "PK_897aac79b4b31d3d500c15a6810" PRIMARY KEY (id);


--
-- Name: support_tickets PK_942e8d8f5df86100471d2324643; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY (id);


--
-- Name: group_deals PK_944b0391a8ffc2fd62935715b52; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_deals
    ADD CONSTRAINT "PK_944b0391a8ffc2fd62935715b52" PRIMARY KEY (id);


--
-- Name: vendor_followers PK_962cc3ca8dd840ca609a0c60099; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_followers
    ADD CONSTRAINT "PK_962cc3ca8dd840ca609a0c60099" PRIMARY KEY (id);


--
-- Name: subscription_plans PK_9ab8fe6918451ab3d0a4fb6bb0c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT "PK_9ab8fe6918451ab3d0a4fb6bb0c" PRIMARY KEY (id);


--
-- Name: vendors PK_9c956c9797edfae5c6ddacc4e6e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY (id);


--
-- Name: vendor_daily_stats PK_a05d639212fea082e8dbce9f607; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_daily_stats
    ADD CONSTRAINT "PK_a05d639212fea082e8dbce9f607" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: spotlight_requests PK_c5484e8ee0e05c31a0c9feed91e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_requests
    ADD CONSTRAINT "PK_c5484e8ee0e05c31a0c9feed91e" PRIMARY KEY (id);


--
-- Name: site_settings PK_e71167433328a5afb90dda43da0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT "PK_e71167433328a5afb90dda43da0" PRIMARY KEY (key);


--
-- Name: blocked_ips PK_e86c3986ac081ad24d5443bb6c5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT "PK_e86c3986ac081ad24d5443bb6c5" PRIMARY KEY (id);


--
-- Name: user_preferences PK_e8cfb5b31af61cd363a6b6d7c25; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT "PK_e8cfb5b31af61cd363a6b6d7c25" PRIMARY KEY (id);


--
-- Name: api_logs PK_ea3f2ad34a2921407593ff4425b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT "PK_ea3f2ad34a2921407593ff4425b" PRIMARY KEY (id);


--
-- Name: referrals PK_ea9980e34f738b6252817326c08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT "PK_ea9980e34f738b6252817326c08" PRIMARY KEY (id);


--
-- Name: activity_logs PK_f25287b6140c5ba18d38776a796; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT "PK_f25287b6140c5ba18d38776a796" PRIMARY KEY (id);


--
-- Name: auth_logs PK_f4ee581a4a56f10b64ffbfc1779; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_logs
    ADD CONSTRAINT "PK_f4ee581a4a56f10b64ffbfc1779" PRIMARY KEY (id);


--
-- Name: user_fcm_tokens PK_f8088ed7e1116e01a4033b6ca76; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_fcm_tokens
    ADD CONSTRAINT "PK_f8088ed7e1116e01a4033b6ca76" PRIMARY KEY (id);


--
-- Name: subscription_plans UQ_0ebf9b0f0cbd7b2fb5b62e3facb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT "UQ_0ebf9b0f0cbd7b2fb5b62e3facb" UNIQUE (slug);


--
-- Name: categories UQ_420d9f679d41281f282f5bc7d09; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE (slug);


--
-- Name: user_preferences UQ_458057fa75b66e68a275647da2e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT "UQ_458057fa75b66e68a275647da2e" UNIQUE (user_id);


--
-- Name: leaderboard UQ_476f228d7816cb177201e6b580b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard
    ADD CONSTRAINT "UQ_476f228d7816cb177201e6b580b" UNIQUE (user_id, period);


--
-- Name: referrals UQ_507a2818bf5524662b068c2e81c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT "UQ_507a2818bf5524662b068c2e81c" UNIQUE (referred_id);


--
-- Name: offer_reports UQ_5fbe80e6efc4a2f88a12bc57178; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reports
    ADD CONSTRAINT "UQ_5fbe80e6efc4a2f88a12bc57178" UNIQUE (offer_id, user_id);


--
-- Name: vendors UQ_65b4134d1ddc73872e6abee2c17; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT "UQ_65b4134d1ddc73872e6abee2c17" UNIQUE (user_id);


--
-- Name: fraud_flags UQ_8f700f9e6481947c611f6315920; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_flags
    ADD CONSTRAINT "UQ_8f700f9e6481947c611f6315920" UNIQUE (entity_type, entity_id);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: user_fcm_tokens UQ_9acd2767cf71e4107b4dfd3fcb0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_fcm_tokens
    ADD CONSTRAINT "UQ_9acd2767cf71e4107b4dfd3fcb0" UNIQUE (token);


--
-- Name: password_resets UQ_9b34edd5264effbbc875c266a9e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT "UQ_9b34edd5264effbbc875c266a9e" UNIQUE (token);


--
-- Name: payments UQ_b2f7b823a21562eeca20e72b006; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "UQ_b2f7b823a21562eeca20e72b006" UNIQUE (order_id);


--
-- Name: users UQ_ba10055f9ef9690e77cf6445cba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_ba10055f9ef9690e77cf6445cba" UNIQUE (referral_code);


--
-- Name: blocked_ips UQ_d9a4a34a43215adb2f0c3612837; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_ips
    ADD CONSTRAINT "UQ_d9a4a34a43215adb2f0c3612837" UNIQUE (ip_address);


--
-- Name: offer_reviews UQ_dffc1a373c51a6f8dffbf68b006; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_reviews
    ADD CONSTRAINT "UQ_dffc1a373c51a6f8dffbf68b006" UNIQUE (offer_id, user_id);


--
-- Name: banner_clicks banner_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_clicks
    ADD CONSTRAINT banner_clicks_pkey PRIMARY KEY (id);


--
-- Name: banner_impressions banner_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_impressions
    ADD CONSTRAINT banner_impressions_pkey PRIMARY KEY (id);


--
-- Name: banner_plans banner_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_plans
    ADD CONSTRAINT banner_plans_pkey PRIMARY KEY (id);


--
-- Name: email_change_requests email_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_change_requests
    ADD CONSTRAINT email_change_requests_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_activity_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_activity_type_key UNIQUE (activity_type);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: offer_impressions offer_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_impressions
    ADD CONSTRAINT offer_impressions_pkey PRIMARY KEY (id);


--
-- Name: razorpay_payments razorpay_payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_order_id_key UNIQUE (order_id);


--
-- Name: razorpay_payments razorpay_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_pkey PRIMARY KEY (id);


--
-- Name: redemption_codes redemption_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_codes
    ADD CONSTRAINT redemption_codes_code_key UNIQUE (code);


--
-- Name: redemption_codes redemption_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_codes
    ADD CONSTRAINT redemption_codes_pkey PRIMARY KEY (id);


--
-- Name: IDX_cba50bbaa34c2b836ea72327e5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cba50bbaa34c2b836ea72327e5" ON public.user_locations USING btree (user_id, created_at);


--
-- Name: idx_activity_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_action ON public.activity_logs USING btree (action);


--
-- Name: idx_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at);


--
-- Name: idx_activity_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);


--
-- Name: idx_api_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_logs_created_at ON public.api_logs USING btree (created_at);


--
-- Name: idx_auth_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_logs_action ON public.auth_logs USING btree (action);


--
-- Name: idx_auth_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_logs_created_at ON public.auth_logs USING btree (created_at);


--
-- Name: idx_auth_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_logs_user_id ON public.auth_logs USING btree (user_id);


--
-- Name: idx_banner_clicks_banner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banner_clicks_banner_id ON public.banner_clicks USING btree (banner_id);


--
-- Name: idx_banner_impressions_banner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banner_impressions_banner_id ON public.banner_impressions USING btree (banner_id);


--
-- Name: idx_email_change_requests_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_change_requests_user_active ON public.email_change_requests USING btree (user_id, used_at, expires_at);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at);


--
-- Name: idx_notification_outbox_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_outbox_created_at ON public.notification_outbox USING btree (created_at);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at);


--
-- Name: idx_offer_impressions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offer_impressions_created_at ON public.offer_impressions USING btree (created_at);


--
-- Name: idx_offer_impressions_offer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offer_impressions_offer_id ON public.offer_impressions USING btree (offer_id);


--
-- Name: idx_offers_active_valid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_active_valid ON public.offers USING btree (is_active, valid_until);


--
-- Name: idx_offers_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_category_id ON public.offers USING btree (category_id);


--
-- Name: idx_offers_vendor_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_vendor_active ON public.offers USING btree (vendor_id, is_active);


--
-- Name: idx_redemption_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemption_codes_user ON public.redemption_codes USING btree (user_id, offer_id);


--
-- Name: idx_saved_offers_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_offer ON public.saved_offers USING btree (offer_id);


--
-- Name: idx_security_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_events_created_at ON public.security_events USING btree (created_at);


--
-- Name: idx_ui_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ui_created ON public.user_interactions USING btree (created_at);


--
-- Name: idx_ui_offer_action_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ui_offer_action_created ON public.user_interactions USING btree (offer_id, action, created_at);


--
-- Name: idx_ui_user_offer_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ui_user_offer_action ON public.user_interactions USING btree (user_id, offer_id, action);


--
-- Name: idx_users_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_city ON public.users USING btree (city);


--
-- Name: uq_saved_offers_user_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_saved_offers_user_offer ON public.saved_offers USING btree (user_id, offer_id);


--
-- Name: uq_vendor_daily_stats_vendor_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vendor_daily_stats_vendor_date ON public.vendor_daily_stats USING btree (vendor_id, stat_date);


--
-- Name: uq_vendor_followers_user_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vendor_followers_user_vendor ON public.vendor_followers USING btree (user_id, vendor_id);


--
-- Name: offer_impressions offer_impressions_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_impressions
    ADD CONSTRAINT offer_impressions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


--
-- Name: offer_impressions offer_impressions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_impressions
    ADD CONSTRAINT offer_impressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: offers offers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: redemption_codes redemption_codes_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_codes
    ADD CONSTRAINT redemption_codes_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


-- (The `powersync` PUBLICATION from the source dump is intentionally
-- omitted here — it's mobile-sync infra, not something the backend test
-- suite needs, and it warns on a default postgres image without
-- wal_level=logical.)


--
-- PostgreSQL database dump complete
--


