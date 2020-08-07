FROM ruby:2.7.1-buster

WORKDIR /app

COPY Gemfile* ./
COPY vendor/cache/ vendor/cache/
RUN BUNDLE_FROZEN=true bundle install --jobs=$(nproc) --local

COPY . .

ENV RUBYOPT '-W:no-deprecated'
CMD ["puma", "--config=puma.conf"]
