-- Seed Data for Pet Adoption & Animal Shelter Management System

INSERT INTO species (id, name, quarantine_days, min_adoption_age_months) VALUES
(1, 'Dog', 14, 2),
(2, 'Cat', 14, 2),
(3, 'Rabbit', 10, 2);

INSERT INTO breeds (id, species_id, name, size_category, requires_yard) VALUES
(1, 1, 'Golden Retriever', 'large', 1),
(2, 1, 'Beagle', 'medium', 0),
(3, 1, 'Indian Pariah', 'medium', 0),
(4, 1, 'German Shepherd', 'large', 1),
(5, 2, 'Domestic Shorthair', 'small', 0),
(6, 2, 'Siamese', 'small', 0),
(7, 2, 'Maine Coon', 'medium', 0),
(8, 3, 'Holland Lop', 'small', 0);

INSERT INTO vaccine_types (id, species_id, vaccine_name, booster_interval_days, is_mandatory) VALUES
(1, 1, 'Rabies', 365, 1),
(2, 1, 'DHPP (5-in-1)', 365, 1),
(3, 1, 'Bordetella', 180, 0),
(4, 2, 'FVRCP', 365, 1),
(5, 2, 'Feline Rabies', 365, 1),
(6, 3, 'RHDV2', 365, 1);

INSERT INTO shelter_zones (id, zone_code, zone_name, species_id, max_capacity, care_level) VALUES
(1, 'DOG-A', 'Canine Main Pavilion', 1, 6, 'standard'),
(2, 'DOG-Q', 'Canine Quarantine Wing', 1, 3, 'quarantine'),
(3, 'CAT-A', 'Feline Sunroom Lounge', 2, 6, 'standard'),
(4, 'CAT-Q', 'Feline Isolation Bay', 2, 3, 'quarantine'),
(5, 'RAB-A', 'Small Mammal Habitat', 3, 4, 'standard');

INSERT INTO adopters (id, full_name, email, phone, address, housing_type, has_yard, has_other_pets, has_children, status) VALUES
(1, 'Aarav Sharma', 'aarav.sharma@example.com', '+91-9876543210', '42 Indiranagar 12th Main, Bengaluru', 'house', 1, 0, 1, 'active'),
(2, 'Priya Nair', 'priya.nair@example.com', '+91-9811223344', '18 Koramangala 4th Block, Bengaluru', 'apartment', 0, 1, 0, 'active'),
(3, 'Rohan Verma', 'rohan.verma@example.com', '+91-9900112233', '7 Whitefield Palm Meadows, Bengaluru', 'house', 1, 1, 1, 'active'),
(4, 'Meera Kapoor', 'meera.kapoor@example.com', '+91-9740055667', '215 Jayanagar 3rd Block, Bengaluru', 'condo', 0, 0, 0, 'active'),
(5, 'Vikram Joshi', 'vikram.joshi@example.com', '+91-9632145870', '91 HSR Layout Sector 2, Bengaluru', 'apartment', 0, 0, 1, 'restricted');

INSERT INTO intake_records (id, intake_code, source_type, source_name, intake_date, intake_condition, notes) VALUES
(1, 'INT-2026-0001', 'rescue', 'Blue Cross Highway Rescue', '2026-09-10', 'healthy', 'Found near outer ring road, friendly demeanor'),
(2, 'INT-2026-0002', 'owner_surrender', 'Kiran Rao', '2026-10-01', 'healthy', 'Owner relocated abroad'),
(3, 'INT-2026-0003', 'stray', 'Municipal Ward 14', '2026-10-15', 'minor_injury', 'Mild paw abrasion treated on arrival'),
(4, 'INT-2026-0004', 'transfer', 'Mysuru Animal Care', '2026-10-20', 'healthy', 'Transferred for higher adoption visibility'),
(5, 'INT-2026-0005', 'rescue', 'Cubbon Park Volunteers', '2026-11-01', 'malnourished', 'Underweight kitten, responsive to feeding'),
(6, 'INT-2026-0006', 'stray', 'Whitefield Rescue Team', '2026-11-22', 'minor_injury', 'Recent rescue currently completing mandatory 14-day quarantine'),
(7, 'INT-2026-0007', 'owner_surrender', 'Neha Desai', '2026-08-15', 'healthy', 'House-trained rabbit, gentle temperament'),
(8, 'INT-2026-0008', 'rescue', 'East Gate Shelter Network', '2026-09-02', 'healthy', 'Vaccinated and socialized adult dog');

INSERT INTO animals (id, microchip_id, name, breed_id, intake_id, zone_id, gender, age_months, weight_kg, intake_date, quarantine_until, medical_status, adoption_status, spayed_neutered, good_with_kids, good_with_pets, notes) VALUES
(1, 'PAW-2026-0001', 'Bruno', 1, 1, 1, 'male', 24, 28.5, '2026-09-10', '2026-09-24', 'cleared', 'available', 1, 1, 1, 'Energetic Golden Retriever, loves fetch and families'),
(2, 'PAW-2026-0002', 'Bella', 2, 2, 1, 'female', 18, 11.2, '2026-10-01', '2026-10-15', 'cleared', 'available', 1, 1, 1, 'Affectionate Beagle, apartment-friendly'),
(3, 'PAW-2026-0003', 'Simba', 3, 3, 1, 'male', 30, 17.8, '2026-10-15', '2026-10-29', 'cleared', 'pending_adoption', 1, 1, 0, 'Alert Indian Pariah, prefers single-pet household'),
(4, 'PAW-2026-0004', 'Milo', 5, 4, 3, 'male', 14, 4.1, '2026-10-20', '2026-11-03', 'cleared', 'available', 1, 1, 1, 'Playful Domestic Shorthair with valid boosters'),
(5, 'PAW-2026-0005', 'Luna', 6, 5, 3, 'female', 8, 3.2, '2026-11-01', '2026-11-15', 'treatment', 'medical_hold', 0, 1, 1, 'Recovering from malnutrition; booster overdue/pending'),
(6, 'PAW-2026-0006', 'Rocky', 4, 6, 2, 'male', 36, 31.0, '2026-11-22', '2026-12-06', 'quarantine', 'medical_hold', 1, 0, 0, 'Active 14-day intake quarantine until Dec 06, 2026'),
(7, 'PAW-2026-0007', 'Clover', 8, 7, 5, 'female', 12, 1.9, '2026-08-15', '2026-08-25', 'cleared', 'adopted', 1, 1, 1, 'Adopted rabbit thriving in new home'),
(8, 'PAW-2026-0008', 'Daisy', 2, 8, 1, 'female', 20, 10.6, '2026-09-02', '2026-09-16', 'cleared', 'adopted', 1, 1, 1, 'Adopted Beagle with completed 7-day checkup');

INSERT INTO medical_records (animal_id, visit_date, record_type, diagnosis, treatment_notes, vet_name, cleared_for_adoption) VALUES
(1, '2026-09-11', 'intake_exam', 'Clinically healthy', 'Deworming and flea prophylaxis administered', 'Dr. Ananya Rao', 1),
(2, '2026-10-02', 'intake_exam', 'Healthy adult female', 'Baseline blood panel normal', 'Dr. Ananya Rao', 1),
(3, '2026-10-16', 'treatment', 'Superficial paw abrasion', 'Antiseptic dressing and 5-day oral antibiotic course', 'Dr. Karthik Menon', 0),
(3, '2026-10-30', 'checkup', 'Abrasion healed', 'Cleared post-quarantine exam', 'Dr. Karthik Menon', 1),
(4, '2026-10-21', 'intake_exam', 'Healthy', 'Microchip verified, dental check clear', 'Dr. Ananya Rao', 1),
(5, '2026-11-02', 'treatment', 'Mild nutritional deficiency', 'High-calorie recovery diet prescribed for 3 weeks', 'Dr. Karthik Menon', 0),
(6, '2026-11-23', 'intake_exam', 'Minor laceration & quarantine intake', 'Wound cleaned; awaiting 14-day quarantine completion', 'Dr. Ananya Rao', 0),
(7, '2026-08-16', 'intake_exam', 'Healthy rabbit', 'Dental and coat check normal', 'Dr. Ananya Rao', 1),
(8, '2026-09-03', 'intake_exam', 'Healthy Beagle', 'Cleared for adoption', 'Dr. Karthik Menon', 1);

-- Vaccination records: include valid, due_soon (within 14 days of 2026-11-27), and overdue!
INSERT INTO vaccination_records (animal_id, vaccine_type_id, administered_date, next_due_date, batch_number, administered_by, status) VALUES
(1, 1, '2026-09-12', '2027-09-12', 'RB-2609-A1', 'Dr. Ananya Rao', 'valid'),
(1, 2, '2026-09-12', '2027-09-12', 'DH-2609-B4', 'Dr. Ananya Rao', 'valid'),
(2, 1, '2026-10-03', '2027-10-03', 'RB-2610-C2', 'Dr. Ananya Rao', 'valid'),
(2, 2, '2026-10-03', '2027-10-03', 'DH-2610-D1', 'Dr. Ananya Rao', 'valid'),
(2, 3, '2026-06-08', '2026-12-05', 'BD-2606-Z9', 'Dr. Karthik Menon', 'due_soon'),
(3, 1, '2026-10-17', '2027-10-17', 'RB-2610-E5', 'Dr. Karthik Menon', 'valid'),
(3, 2, '2026-10-17', '2027-10-17', 'DH-2610-F3', 'Dr. Karthik Menon', 'valid'),
(4, 4, '2026-10-22', '2027-10-22', 'FV-2610-K1', 'Dr. Ananya Rao', 'valid'),
(4, 5, '2026-10-22', '2027-10-22', 'FR-2610-L2', 'Dr. Ananya Rao', 'valid'),
(5, 4, '2025-11-10', '2026-11-10', 'FV-2511-M8', 'Dr. Karthik Menon', 'overdue'),
(6, 1, '2026-11-23', '2027-11-23', 'RB-2611-N1', 'Dr. Ananya Rao', 'valid'),
(7, 6, '2026-08-17', '2027-08-17', 'RH-2608-P2', 'Dr. Ananya Rao', 'valid'),
(8, 1, '2026-09-04', '2027-09-04', 'RB-2609-Q7', 'Dr. Karthik Menon', 'valid'),
(8, 2, '2026-09-04', '2027-09-04', 'DH-2609-R8', 'Dr. Karthik Menon', 'valid');

INSERT INTO adoption_applications (id, application_code, adopter_id, animal_id, status, home_check_passed, reviewer_notes, submitted_at, updated_at) VALUES
(1, 'APP-2026-0001', 4, 7, 'completed', 1, 'Quiet condo ideal for Clover; approved by adoption panel', '2026-08-28 10:15:00', '2026-09-05 14:30:00'),
(2, 'APP-2026-0002', 1, 8, 'completed', 1, 'Fenced yard and great family references', '2026-09-20 11:00:00', '2026-09-28 16:00:00'),
(3, 'APP-2026-0003', 3, 3, 'approved', 1, 'Home check passed; ready for final placement', '2026-11-10 09:30:00', '2026-11-24 15:20:00'),
(4, 'APP-2026-0004', 2, 4, 'home_check', 0, 'Virtual tour scheduled for tomorrow', '2026-11-18 14:45:00', '2026-11-25 10:10:00'),
(5, 'APP-2026-0005', 1, 1, 'under_review', 0, 'Verifying yard fencing photos', '2026-11-21 16:20:00', '2026-11-25 12:00:00'),
(6, 'APP-2026-0006', 2, 2, 'submitted', 0, 'Initial application received', '2026-11-26 10:05:00', '2026-11-26 10:05:00'),
(7, 'APP-2026-0007', 5, 2, 'rejected', 0, 'Incomplete landlord pet-permission verification', '2026-11-15 13:00:00', '2026-11-17 09:00:00');

INSERT INTO adoption_placements (id, certificate_number, application_id, animal_id, adopter_id, adoption_date, adoption_fee, issued_by) VALUES
(1, 'CERT-2026-0001', 1, 7, 4, '2026-09-05', 1500.0, 'Sneha Kulkarni (Shelter Director)'),
(2, 'CERT-2026-0002', 2, 8, 1, '2026-09-28', 2500.0, 'Sneha Kulkarni (Shelter Director)');

INSERT INTO post_adoption_followups (placement_id, scheduled_date, completed_date, followup_type, animal_wellbeing, notes, conducted_by) VALUES
(1, '2026-09-12', '2026-09-12', '7_day_check', 'thriving', 'Eating well and comfortable in playpen', 'Dr. Ananya Rao'),
(1, '2026-10-05', '2026-10-06', '30_day_check', 'thriving', 'Weight stable; owner sent photos', 'Meenakshi Iyer'),
(1, '2026-12-04', NULL, '90_day_check', 'pending', 'Scheduled quarterly welfare check', NULL),
(2, '2026-10-05', '2026-10-05', '7_day_check', 'adjusting', 'Minor leash pulling; positive reinforcement tips shared', 'Meenakshi Iyer'),
(2, '2026-10-28', '2026-10-29', '30_day_check', 'thriving', 'Fully settled with family', 'Meenakshi Iyer'),
(2, '2026-12-27', NULL, '90_day_check', 'pending', 'Scheduled 90-day check-in', NULL);
