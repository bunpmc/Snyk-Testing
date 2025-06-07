-- Enable UUID extension for Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define ENUMs
CREATE TYPE role_enum AS ENUM ('doctor', 'manager', 'advisor');
CREATE TYPE department_enum AS ENUM (
    'reproductive_health',
    'gynecology',
    'urology',
    'transgender_care',
    'sexual_health'
);
CREATE TYPE speciality_enum AS ENUM (
    'gynecologist',
    'urologist',
    'endocrinologist',
    'reproductive_specialist',
    'sexual_health_specialist'
);
CREATE TYPE record_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE process_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'resolved');
CREATE TYPE blog_status AS ENUM ('draft', 'published', 'archived');

-- Create patients table
CREATE TABLE public.patients (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    allergies JSONB,
    chronic_conditions JSONB,
    past_surgeries JSONB,
    vaccination_status JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create staff_members table
CREATE TABLE public.staff_members (
    staff_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    working_email VARCHAR(255) NOT NULL UNIQUE,
    role role_enum NOT NULL,
    years_experience INTEGER CHECK (years_experience >= 0),
    hired_at DATE NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create doctor_details table
CREATE TABLE public.doctor_details (
    doctor_id UUID PRIMARY KEY REFERENCES public.staff_members(staff_id) ON DELETE CASCADE,
    department department_enum NOT NULL,
    speciality speciality_enum NOT NULL,
    license_no VARCHAR(50) NOT NULL UNIQUE
);

-- Create staff_schedules table
CREATE TABLE public.staff_schedules (
    schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES public.staff_members(staff_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule TEXT,
    CHECK (end_time > start_time)
);

-- Create staff_certifications table
CREATE TABLE public.staff_certifications (
    certification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES public.staff_members(staff_id) ON DELETE CASCADE,
    certification_name TEXT NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    CHECK (expiry_date IS NULL OR expiry_date > issue_date)
);

-- Create staff_history table
CREATE TABLE public.staff_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES public.staff_members(staff_id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES public.staff_members(staff_id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    field_name TEXT NOT NULL CHECK (field_name IN ('full_name', 'working_email', 'role', 'years_experience', 'hired_at', 'is_available', 'department', 'speciality', 'license_no')),
    old_value JSONB,
    new_value JSONB,
    change_reason TEXT
);

-- Create visit_types table
CREATE TABLE public.visit_types (
    visit_type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_name TEXT NOT NULL UNIQUE CHECK (type_name IN ('consultation', 'follow-up', 'emergency', 'routine'))
);

-- Create receipts table
CREATE TABLE public.receipts (
    receipt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) CHECK (amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create health_records table
CREATE TABLE public.health_records (
    health_record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    doctor_id UUID NOT NULL REFERENCES public.staff_members(staff_id),
    visit_type_id UUID NOT NULL REFERENCES public.visit_types(visit_type_id),
    symptoms TEXT,
    diagnosis TEXT,
    prescription JSONB,
    follow_up_date DATE,
    receipt_id UUID REFERENCES public.receipts(receipt_id),
    record_status record_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (doctor_id != patient_id)
);

-- Create health_record_histories table
CREATE TABLE public.health_record_histories (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    health_record_id UUID NOT NULL REFERENCES public.health_records(health_record_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id),
    changed_by UUID NOT NULL REFERENCES public.staff_members(staff_id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    field_name TEXT NOT NULL CHECK (field_name IN ('symptoms', 'diagnosis', 'prescription', 'follow_up_date', 'record_status')),
    old_value JSONB,
    new_value JSONB,
    change_reason TEXT
);

-- Create period_tracking table
CREATE TABLE public.period_tracking (
    period_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    estimated_next_date TIMESTAMP WITH TIME ZONE,
    cycle_length INTEGER CHECK (cycle_length > 0),
    flow_intensity TEXT CHECK (flow_intensity IN ('light', 'medium', 'heavy')),
    symptoms JSONB,
    period_description TEXT,
    predictions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create service_categories table
CREATE TABLE public.service_categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL UNIQUE,
    category_description TEXT
);

-- Create medical_services table
CREATE TABLE public.medical_services (
    service_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES public.service_categories(category_id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    service_description TEXT,
    service_cost NUMERIC CHECK (service_cost >= 0),
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create health_record_services table
CREATE TABLE public.health_record_services (
    health_record_service_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    health_record_id UUID NOT NULL REFERENCES public.health_records(health_record_id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.medical_services(service_id),
    unit_cost NUMERIC CHECK (unit_cost >= 0),
    quantity INTEGER CHECK (quantity > 0) DEFAULT 1,
    service_notes TEXT
);

-- Create service_process_logs table
CREATE TABLE public.service_process_logs (
    service_process_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    health_record_service_id UUID NOT NULL REFERENCES public.health_record_services(health_record_service_id) ON DELETE CASCADE,
    process_status process_status NOT NULL,
    process_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create blog_posts table
CREATE TABLE public.blog_posts (
    blog_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES public.staff_members(staff_id),
    blog_title TEXT NOT NULL,
    blog_content TEXT NOT NULL,
    excerpt TEXT,
    featured_image_url TEXT,
    blog_tags JSONB,
    published_at TIMESTAMP WITH TIME ZONE,
    blog_status blog_status DEFAULT 'draft',
    view_count INTEGER DEFAULT 0 CHECK (view_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (blog_status = 'published' AND published_at IS NOT NULL OR blog_status != 'published')
);

-- Create patient_reports table (replacing guest_reports)
CREATE TABLE public.patient_reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    report_content TEXT NOT NULL,
    report_description TEXT,
    staff_id UUID REFERENCES public.staff_members(staff_id),
    report_status report_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION create_staff_member(
  full_name_input TEXT,
  role_name_input VARCHAR(50),
  working_email_input VARCHAR(100),
  department_input VARCHAR(100) DEFAULT NULL,
  hire_date_input DATE DEFAULT CURRENT_DATE,
  specialty_input VARCHAR(100) DEFAULT NULL,
  license_no_input VARCHAR(50) DEFAULT NULL,
  years_experience_input INTEGER DEFAULT NULL,
  created_at_input TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at_input TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS TABLE (
  user_id UUID,
  staff_id INTEGER,
  doctor_id INTEGER,
  role_id INTEGER,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_role_id INTEGER;
  v_staff_id INTEGER;
  v_doctor_id INTEGER;
BEGIN 
  -- Get role ID
  SELECT role_id INTO v_role_id
  FROM user_roles
  WHERE role_name = role_name_input;

  -- Insert user
  INSERT INTO app_users (
    full_name,
    email,
    user_status,
    created_at,
    updated_at
  ) VALUES (
    full_name_input,
    email_input,
    'active',
    created_at_input,
    updated_at_input
  )
  RETURNING user_id INTO v_user_id;

  -- Insert staff
  INSERT INTO staff_members (
    user_id,
    role_id,
    working_email,
    employee_id,
    department,
    hire_date,
    staff_status,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_role_id,
    working_email_input,
    'EMP-' || v_user_id::TEXT,
    department_input,
    hire_date_input,
    'active',
    created_at_input,
    updated_at_input
  )
  RETURNING staff_id INTO v_staff_id;

  -- Insert doctor if applicable
  IF role_name_input = 'doctor' THEN
    INSERT INTO doctors (
      doctor_id,
      specialty,
      license_no,
      years_experience,
      is_available,
      created_at,
      updated_at
    ) VALUES (
      v_staff_id,
      specialty_input,
      license_no_input,
      years_experience_input,
      TRUE,
      created_at_input,
      updated_at_input
    )
    RETURNING doctor_id INTO v_doctor_id;
  ELSE
    v_doctor_id := NULL;
  END IF;

  RETURN QUERY SELECT 
    v_user_id,
    v_staff_id,
    v_doctor_id,
    v_role_id,
    'Staff member created successfully';

EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT 
      NULL, NULL, NULL, NULL,
      'Error: User with this email already exists';
  WHEN others THEN
    RETURN QUERY SELECT 
      NULL, NULL, NULL, NULL,
      'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_staff_by_id (
  staff_id_input INTEGER,
  working_email_input VARCHAR(100),
  department_input VARCHAR(100) DEFAULT NULL,
  years_experience_input DATE DEFAULT CURRENT_DATE,
  specialty_input VARCHAR(100) DEFAULT NULL,
  updated_at_input DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  staff_id INTEGER,
  message TEXT
) AS $$
DECLARE
  v_staff_id INTEGER;
BEGIN
  UPDATE staff_members
  SET 
    working_email = working_email_input,
    department = department_input,
    years_experience = years_experience_input,
    specialty = specialty_input,
    updated_at = updated_at_input
  WHERE staff_id = staff_id_input
  RETURNING staff_id INTO v_staff_id;

  RETURN QUERY SELECT 
    v_staff_id,
    'Staff member updated successfully';

EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT 
      NULL,
      'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_staff_by_id(
  staff_id_input INTEGER
) RETURNS TABLE (staff_id INTEGER, message TEXT) AS $$
DECLARE
  v_staff_id INTEGER;
BEGIN
  UPDATE staff_members
  SET staff_status = 'inactive', -- Soft delete
      updated_at = NOW()
  WHERE staff_id = staff_id_input
  RETURNING staff_id INTO v_staff_id;
  RETURN QUERY SELECT 
  v_staff_id, 
  'Staff member deleted successfully';
EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT 
    NULL, 
    'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_staff_by_id(
    staff_id_input INTEGER DEFAULT NULL,
    working_email_input VARCHAR(100) DEFAULT NULL,
    department_input VARCHAR(100) DEFAULT NULL,
    years_experience_input INTEGER DEFAULT NULL,
    specialty_input VARCHAR(100) DEFAULT NULL,
    updated_at_input TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    staff_id INTEGER,
    user_id UUID,
    full_name TEXT,
    role_name VARCHAR(50),
    working_email VARCHAR(100),
    department VARCHAR(100),
    years_experience INTEGER,
    specialty VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE
)
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.staff_id,
        au.full_name,
        ur.role_name,
        s.working_email,
        s.department,
        d.years_experience,
        d.specialty,
        s.updated_at,
        s.created_at
    FROM staff_members s
    JOIN app_users au ON s.user_id = au.user_id
    JOIN user_roles ur ON s.role_id = ur.role_id
    LEFT JOIN doctors d ON s.staff_id = d.doctor_id
    WHERE s.staff_status = 'active'
      AND (staff_id_input IS NULL OR s.staff_id = staff_id_input)
      AND (working_email_input IS NULL OR s.working_email = working_email_input)
      AND (department_input IS NULL OR s.department = department_input)
      AND (years_experience_input IS NULL OR d.years_experience = years_experience_input)
      AND (specialty_input IS NULL OR d.specialty = specialty_input)
      AND (updated_at_input IS NULL OR s.updated_at = updated_at_input);

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            NULL::INTEGER,
            NULL::UUID,
            NULL::TEXT,
            NULL::VARCHAR(50),
            NULL::VARCHAR(100),
            NULL::VARCHAR(100),
            NULL::INTEGER,
            NULL::VARCHAR(100),
            NULL::TIMESTAMP WITH TIME ZONE,
            NULL::TIMESTAMP WITH TIME ZONE
        WHERE FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_health_record(
    user_id_input UUID,
    doctor_id_input INTEGER,
    visit_date_input TIMESTAMP WITH TIME ZONE,
    visit_type_input VARCHAR(50),
    symptoms_input TEXT DEFAULT NULL,
    diagnosis_input TEXT DEFAULT NULL,
    prescription_input TEXT DEFAULT NULL,
    follow_up_date_input TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    patient_name_input TEXT DEFAULT NULL,
    sex_biology_input VARCHAR(50) DEFAULT NULL,
    sex_identity_input VARCHAR(50) DEFAULT NULL,
    health_insurance_input VARCHAR(100) DEFAULT NULL,
    allergies_input TEXT DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    patient_id INTEGER,
    health_record_id INTEGER,
    message TEXT
)
AS $$
DECLARE
    v_user_id UUID;
    v_patient_id INTEGER;
    v_doctor_id INTEGER;
    v_health_record_id INTEGER;
BEGIN
    -- Verify user exists in app_users
    SELECT user_id INTO v_user_id
    FROM app_users
    WHERE user_id = user_id_input AND user_status = 'active';

    IF v_user_id IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::INTEGER,
            'Error: User not found or inactive' AS message;
        RETURN;
    END IF;

    -- Verify doctor exists in doctors
    SELECT doctor_id INTO v_doctor_id
    FROM doctors
    WHERE doctor_id = doctor_id_input AND is_available = TRUE;

    IF v_doctor_id IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::INTEGER,
            'Error: Doctor not found or unavailable' AS message;
        RETURN;
    END IF;

    -- Check if patient exists; create if not
    SELECT patient_id INTO v_patient_id
    FROM patients
    WHERE user_id = user_id_input;

    IF v_patient_id IS NULL THEN
        INSERT INTO patients (
            user_id,
            patient_name,
            sex_biology,
            sex_identity,
            health_insurance,
            allergies,
            created_at,
            updated_at
        )
        VALUES (
            user_id_input,
            COALESCE(patient_name_input, (SELECT full_name FROM app_users WHERE user_id = user_id_input)),
            sex_biology_input,
            sex_identity_input,
            health_insurance_input,
            allergies_input,
            NOW(),
            NOW()
        )
        RETURNING patient_id INTO v_patient_id;
    END IF;

    -- Create health record
    INSERT INTO health_records (
        patient_id,
        doctor_id,
        visit_date,
        visit_type,
        symptoms,
        diagnosis,
        prescription,
        follow_up_date,
        record_status,
        created_at,
        updated_at
    )
    VALUES (
        v_patient_id,
        v_doctor_id,
        visit_date_input,
        visit_type_input,
        symptoms_input,
        diagnosis_input,
        prescription_input,
        follow_up_date_input,
        'active',
        NOW(),
        NOW()
    )
    RETURNING health_record_id INTO v_health_record_id;

    -- Return result
    RETURN QUERY
    SELECT
        user_id_input,
        v_patient_id,
        v_health_record_id,
        'Health record created successfully' AS message;

EXCEPTION
    WHEN unique_violation THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::INTEGER,
            'Error: Unique constraint violation (e.g., email or patient data)' AS message;
    WHEN OTHERS THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::INTEGER,
            'Error: ' || SQLERRM AS message;
END;
$$ LANGUAGE plpgsql;