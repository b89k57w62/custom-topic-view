# frozen_string_literal: true

module Jobs
  class ViewCountIncrement < ::Jobs::Scheduled
    every 2.hours

    def execute(args)
      return unless SiteSetting.view_count_auto_increment_enabled?

      Rails.logger.info "Starting view count auto increment job"

      begin
        pinned_topics = select_pinned_topics
        pinned_count = update_topics(pinned_topics, "pinned")
        regular_topics = select_regular_topics
        regular_count = update_topics(regular_topics, "regular")

        Rails.logger.info "View count increment completed: #{pinned_count} pinned + #{regular_count} regular topics updated"

      rescue => e
        Rails.logger.error "View count increment job failed: #{e.message}"
        Rails.logger.error e.backtrace.join("\n")
      end
    end

    private

    def select_pinned_topics
      all_pinned = Topic.where.not(pinned_at: nil)
                       .where(archetype: Archetype.default)

      return [] if all_pinned.empty?

      total_count = all_pinned.count
      selection_ratio = case total_count
                       when 1..10   then 0.7
                       when 11..30  then 0.6
                       when 31..100 then 0.5
                       else              0.4
                       end

      selection_count = (total_count * selection_ratio).round.clamp(1, total_count)

      Rails.logger.info "Found #{total_count} pinned topics, selecting #{selection_count}"

      weighted_topics = all_pinned.sort_by do |topic|
        views = topic.display_view_count || 0
        days_pinned = (Time.current - topic.pinned_at) / 1.day

        weight = (views < 500 ? 1.5 : 1.0) * (days_pinned < 7 ? 1.3 : 1.0)
        -weight + rand(0.3)
      end

      weighted_topics.first(selection_count)
    end

    def select_regular_topics
      batch_size = SiteSetting.view_count_regular_batch_size || 30

      Topic.where(pinned_at: nil)
           .where(archetype: Archetype.default)
           .where("created_at > ?", 90.days.ago)
           .order("RANDOM()")
           .limit(batch_size)
    end

    def update_topics(topics, type)
      return 0 if topics.empty?

      updated_count = 0

      topics.each do |topic|
        if increment_topic_views(topic)
          updated_count += 1
        end
      end

      Rails.logger.info "Updated #{updated_count} #{type} topics"
      updated_count
    end

    def increment_topic_views(topic)
      current_total = topic.display_view_count || 0
      increment = calculate_increment(current_total)

      current_custom = topic.custom_fields['custom_view_count']&.to_i || 0
      new_custom = current_custom + increment

      if new_custom >= current_custom
        topic.custom_fields['custom_view_count'] = new_custom
        topic.custom_fields['use_custom_view_count'] = true
        topic.custom_fields['last_auto_increment'] = Time.current.to_s
        topic.save_custom_fields(true)

        Rails.logger.debug "Topic #{topic.id}: #{current_total} -> #{current_total + increment} (+#{increment})"
        return true
      else
        Rails.logger.warn "Skipped topic #{topic.id}: would decrease views"
        return false
      end
    end

    def calculate_increment(current_views)
      case current_views
      when 0..100   then rand(1..3)
      when 101..500 then rand(2..5)
      else               rand(3..8)
      end
    end
  end
end
