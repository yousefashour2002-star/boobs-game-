# Database Schema

## Rooms
- id: TEXT (Primary Key, Join Code)
- host_id: TEXT
- status: TEXT (waiting, playing, voting)
- chat_time: INTEGER
- voting_time: INTEGER
- created_at: DATETIME

## Players
- id: TEXT (Primary Key)
- room_id: TEXT
- real_name: TEXT
- fake_name: TEXT
- age: INTEGER
- personality: TEXT
- bio: TEXT
- avatar_url: TEXT
- is_blocked: INTEGER (0 or 1)
- is_host: INTEGER (0 or 1)
- points: INTEGER
- joined_at: DATETIME

## Messages
- id: TEXT (Primary Key)
- room_id: TEXT
- sender_id: TEXT
- receiver_id: TEXT (NULL for public)
- content: TEXT
- type: TEXT (text, question, answer)
- created_at: DATETIME

## Votes
- id: TEXT (Primary Key)
- room_id: TEXT
- voter_id: TEXT
- target_id: TEXT
- round_id: TEXT
- created_at: DATETIME
