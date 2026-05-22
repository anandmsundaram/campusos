-- Add meal_meetup to request_category enum
-- Required for social dining/meetup requests posted through the app

alter type request_category add value if not exists 'meal_meetup';
